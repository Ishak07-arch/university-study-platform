import type { Db } from "./db";
import type { Profile } from "@/lib/types";
import { HttpError } from "./auth";
import { teachingScope } from "./teaching";
import { visibleQuestion } from "./questions";
export async function classOverview(
  db: Db,
  u: Profile,
  group: string,
  subject: string,
) {
  return db.transaction(async (tx) => {
    await teachingScope(tx, u, group, subject);
    const stats = (
      await tx.query<{
        students: number;
        active: number;
        accuracy: number | null;
      }>(
        `WITH enrolled AS (SELECT id FROM users WHERE role='student' AND NOT is_demo AND group_id=$1), recent AS (
 SELECT a.user_id,a.correct FROM question_attempts a JOIN enrolled e ON e.id=a.user_id JOIN study_sessions s ON s.id=a.session_id
 WHERE s.subject_id=$2 AND a.created_at>=now()-interval '7 days')
 SELECT (SELECT count(*)::int FROM enrolled) students,count(DISTINCT user_id)::int active,round(100*avg(correct::int))::int accuracy FROM recent`,
        [group, subject],
      )
    ).rows[0];
    const questions = (
      await tx.query<{ id: string; prompt: string }>(
        `SELECT q.id,q.prompt FROM questions q JOIN lessons l ON l.id=q.lesson_id JOIN chapters c ON c.id=l.chapter_id WHERE c.subject_id=$1 AND ${visibleQuestion} ORDER BY q.id`,
        [subject],
      )
    ).rows;
    const challenges = (
      await tx.query<{
        id: string;
        title: string;
        verified: number;
        pending: number;
        rejected: number;
      }>(
        `SELECT c.id,c.title,count(s.student_id) FILTER(WHERE status='verified')::int verified,count(s.student_id) FILTER(WHERE status='pending')::int pending,count(s.student_id) FILTER(WHERE status='rejected')::int rejected FROM professor_challenges c LEFT JOIN challenge_submissions s ON s.challenge_id=c.id WHERE c.group_id=$1 AND c.subject_id=$2 GROUP BY c.id ORDER BY c.due_at DESC`,
        [group, subject],
      )
    ).rows;
    const queue = (
      await tx.query<{
        id: string;
        title: string;
        name: string;
        student: string;
        response: string;
      }>(
        `SELECT c.id,c.title,u.name,u.id student,s.response FROM challenge_submissions s JOIN professor_challenges c ON c.id=s.challenge_id JOIN users u ON u.id=s.student_id AND u.group_id=c.group_id WHERE c.group_id=$1 AND c.subject_id=$2 AND ($3 OR c.created_by=$4) AND s.status='pending' ORDER BY s.submitted_at`,
        [group, subject, u.role === "admin", u.id],
      )
    ).rows;
    return { stats, questions, challenges, queue };
  });
}
export async function studentChallenges(db: Db, u: Profile) {
  if (u.role !== "student" || u.is_demo)
    throw new HttpError(403, "Student account required.");
  return (
    await db.query<{
      id: string;
      title: string;
      instructions: string;
      subject: string;
      academic: boolean;
      question_id: string | null;
      xp_reward: number;
      due_at: string;
      status: string | null;
      note: string | null;
    }>(
      `SELECT c.id,c.title,c.instructions,sub.name subject,c.academic,c.question_id,c.xp_reward,c.due_at,s.status,s.note FROM professor_challenges c JOIN subjects sub ON sub.id=c.subject_id LEFT JOIN challenge_submissions s ON s.challenge_id=c.id AND s.student_id=$1 WHERE c.group_id=$2 AND (c.due_at>now() OR s.student_id IS NOT NULL) ORDER BY c.due_at DESC`,
      [u.id, u.group_id],
    )
  ).rows;
}
