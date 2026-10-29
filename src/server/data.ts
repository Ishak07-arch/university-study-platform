import { getDb } from "./db";
import { currentUser } from "./auth";
import { localDay, streakFromDays } from "./learning";
import { subjectsSeed } from "./seed";
import {
  availableQuestion,
  questionSource,
  visibleQuestion,
} from "./questions";
import type {
  Profile,
  Snapshot,
  Subject,
  Task,
  Lesson,
  StudySession,
  Leader,
  Question,
  SessionPayload,
} from "@/lib/types";
export const previewProfile: Profile = {
  id: "preview",
  name: "Alex Johnson",
  email: "alex@example.com",
  role: "student",
  group_id: "demo-group",
  group_name: "Demo class",
  daily_goal: 40,
  timezone: "Africa/Lagos",
  is_demo: true,
};
export async function snapshot(supplied?: Profile | null): Promise<Snapshot> {
  const user = supplied === undefined ? await currentUser() : supplied;
  const profile = user || previewProfile;
  const db = await getDb();
  const subjects = (
    await db.query<Subject>(
      `SELECT s.*,count(DISTINCT q.id)::int total_questions,count(DISTINCT a.question_id)::int solved FROM subjects s JOIN class_groups g ON g.semester_id=s.semester_id LEFT JOIN chapters c ON c.subject_id=s.id LEFT JOIN lessons l ON l.chapter_id=c.id LEFT JOIN questions q ON q.lesson_id=l.id AND q.origin<>'generated' AND ${visibleQuestion} AND ($3=false OR q.origin='seed') LEFT JOIN question_attempts a ON a.question_id=q.id AND a.user_id=$1 AND a.correct=true WHERE g.id=$2 GROUP BY s.id ORDER BY CASE s.id WHEN 'statistics' THEN 0 WHEN 'microeconomics' THEN 1 WHEN 'accounting' THEN 2 WHEN 'economics' THEN 3 ELSE 4 END,s.name`,
      [profile.id, profile.group_id, profile.is_demo],
    )
  ).rows
    .filter(
      (s) => !profile.is_demo || subjectsSeed.some((seed) => seed[0] === s.id),
    )
    .map((s) => ({
      ...s,
      progress: s.total_questions
        ? Math.round((s.solved / s.total_questions) * 100)
        : 0,
    }));
  const tasks = (
    await db.query<Task>(
      `SELECT t.*,s.name subject_name,s.color,(c.user_id IS NOT NULL) completed FROM tasks t JOIN subjects s ON s.id=t.subject_id LEFT JOIN task_completions c ON c.task_id=t.id AND c.user_id=$1 WHERE t.group_id=$2 ORDER BY c.user_id NULLS FIRST,t.due_at,t.importance DESC`,
      [profile.id, profile.group_id],
    )
  ).rows;
  const lessons = (
    await db.query<Lesson>(
      `SELECT l.*,c.subject_id,c.title chapter FROM lessons l JOIN chapters c ON c.id=l.chapter_id JOIN subjects s ON s.id=c.subject_id JOIN class_groups g ON g.semester_id=s.semester_id WHERE g.id=$1 ORDER BY c.position,l.position`,
      [profile.group_id],
    )
  ).rows.filter(
    (l) =>
      !profile.is_demo ||
      subjectsSeed.some((seed) => seed[0] + "-lesson" === l.id),
  );
  const xp = (
    await db.query<{
      total: number;
      week: number;
      previous: number;
      today: number;
    }>(
      `SELECT coalesce(sum(amount),0)::int total,coalesce(sum(amount) FILTER (WHERE created_at>=date_trunc('week',now() AT TIME ZONE $2) AT TIME ZONE $2),0)::int week,coalesce(sum(amount) FILTER (WHERE created_at>=((date_trunc('week',now() AT TIME ZONE $2)-interval '7 days') AT TIME ZONE $2) AND created_at<(date_trunc('week',now() AT TIME ZONE $2) AT TIME ZONE $2)),0)::int previous,coalesce(sum(amount) FILTER (WHERE (created_at AT TIME ZONE $2)::date=$3::date),0)::int today FROM xp_events WHERE user_id=$1`,
      [profile.id, profile.timezone, localDay(profile.timezone)],
    )
  ).rows[0];
  const days = (
    await db.query<{ day: string }>(
      `SELECT day::text AS "day" FROM study_days WHERE user_id=$1 ORDER BY day DESC`,
      [profile.id],
    )
  ).rows.map((d) => d.day);
  const active =
    (
      await db.query<StudySession>(
        `SELECT ss.*,s.name title FROM study_sessions ss JOIN subjects s ON s.id=ss.subject_id WHERE ss.user_id=$1 AND ss.completed_at IS NULL ORDER BY ss.updated_at DESC LIMIT 1`,
        [profile.id],
      )
    ).rows[0] || null;
  async function leaders(period: "week" | "month") {
    return (
      await db.query<Leader>(
        `SELECT u.id,u.name,coalesce(sum(x.amount),0)::int xp,0 streak,(u.id=$1) is_you FROM users u LEFT JOIN xp_events x ON x.user_id=u.id AND x.created_at>=date_trunc('${period}',now() AT TIME ZONE $3) AT TIME ZONE $3 WHERE u.group_id=$2 AND u.is_demo=false AND u.role='student' GROUP BY u.id ORDER BY xp DESC,u.name LIMIT 20`,
        [profile.id, profile.group_id, profile.timezone],
      )
    ).rows;
  }
  let weekLeaders = await leaders("week"),
    monthlyLeaders = await leaders("month");
  if (profile.is_demo) {
    weekLeaders = [
      {
        id: "sample-1",
        name: "Ahmed Hassan",
        xp: 180,
        streak: 9,
        is_you: false,
      },
      {
        id: "sample-2",
        name: "Sara Williams",
        xp: 145,
        streak: 8,
        is_you: false,
      },
      {
        id: profile.id,
        name: profile.name,
        xp: user ? xp.week : 30,
        streak: 7,
        is_you: true,
      },
      {
        id: "sample-3",
        name: "Daniel Okafor",
        xp: 25,
        streak: 4,
        is_you: false,
      },
    ].sort((a, b) => b.xp - a.xp);
    monthlyLeaders = weekLeaders
      .map((l) => ({ ...l, xp: l.is_you ? (user ? xp.total : 510) : l.xp * 4 }))
      .sort((a, b) => b.xp - a.xp);
  }
  const monday = new Date(localDay(profile.timezone) + "T12:00:00Z");
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    return days.includes(d.toISOString().slice(0, 10));
  });
  if (!user) {
    subjects[0].progress = 50;
    subjects[0].solved = 2;
  }
  return JSON.parse(
    JSON.stringify({
      profile,
      subjects,
      tasks,
      lessons,
      xp: user ? xp.total : 510,
      weeklyXp: user ? xp.week : 30,
      previousXp: user ? xp.previous : 0,
      todayXp: user ? xp.today : 30,
      streak: user ? streakFromDays(days, localDay(profile.timezone)) : 7,
      weekDays: user ? weekDays : weekDays.map((_, i) => i === 0),
      leaders: weekLeaders,
      monthlyLeaders,
      active: user
        ? active
        : {
            id: "preview-session",
            subject_id: "statistics",
            mode: "practice",
            question_ids: [
              "statistics-1",
              "statistics-2",
              "statistics-3",
              "statistics-4",
            ],
            position: 2,
            completed_at: null,
            title: "Statistics",
          },
      authenticated: !!user,
    }),
  );
}
export async function sessionData(
  user: Profile,
  id: string,
): Promise<SessionPayload | null> {
  const db = await getDb();
  const session = (
    await db.query<StudySession>(
      "SELECT * FROM study_sessions WHERE id=$1 AND user_id=$2",
      [id, user.id],
    )
  ).rows[0];
  if (!session) return null;
  const subject = (
    await db.query<Subject>("SELECT * FROM subjects WHERE id=$1", [
      session.subject_id,
    ])
  ).rows[0];
  const full = session.completed_at
    ? null
    : await availableQuestion(db, user, session.question_ids[session.position]);
  const q = full
    ? {
        id: full.id,
        lesson_id: full.lesson_id,
        subject_id: session.subject_id,
        prompt: full.prompt,
        options: full.options,
        topic: full.topic,
        note: full.note,
        question_type: full.question_type,
        difficulty: full.difficulty,
        origin: full.origin,
        source: await questionSource(db, full),
        similar: !!full.generation && full.generation.template !== "cloze",
      }
    : null;
  const correct = q
    ? (
        await db.query(
          "SELECT id FROM question_attempts WHERE session_id=$1 AND question_id=$2 AND correct=true",
          [id, q.id],
        )
      ).rows.length > 0
    : false;
  return JSON.parse(
    JSON.stringify({
      session,
      subject,
      question: q,
      alreadyCorrect: correct,
      notice:
        !q && !session.completed_at
          ? "This exercise was withdrawn or its source is unavailable. Continue to the next question."
          : session.practice_notice || undefined,
    }),
  );
}
