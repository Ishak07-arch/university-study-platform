import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db } from "./db";
import type { Profile } from "@/lib/types";
import { audit, HttpError } from "./auth";
import { award } from "./learning";
import { teachingScope } from "./teaching";
import { visibleQuestion } from "./questions";
export const challengeInput = z
  .object({
    group: z.string().min(1),
    subject: z.string().min(1),
    title: z.string().trim().min(3).max(120),
    instructions: z.string().trim().min(5).max(2000),
    deadline: z.iso.datetime(),
    question: z.string().max(150).nullable(),
    xp: z.number().int().min(0).max(100),
    academic: z.boolean(),
  })
  .strict();
interface Challenge {
  id: string;
  group_id: string;
  subject_id: string;
  created_by: string;
  due_at: string;
  question_id: string | null;
  xp_reward: number;
  academic: boolean;
}
export async function createChallenge(
  db: Db,
  u: Profile,
  input: z.infer<typeof challengeInput>,
) {
  const d = challengeInput.parse(input);
  return db.transaction(async (tx) => {
    await teachingScope(tx, u, d.group, d.subject);
    if (Date.parse(d.deadline) <= Date.now())
      throw new HttpError(400, "Choose a future deadline.");
    if (
      d.question &&
      !(
        await tx.query(
          `SELECT q.id FROM questions q JOIN lessons l ON l.id=q.lesson_id JOIN chapters c ON c.id=l.chapter_id WHERE c.subject_id=$1 AND q.id=$2 AND ${visibleQuestion}`,
          [d.subject, d.question],
        )
      ).rows.length
    )
      throw new HttpError(400, "Choose an available exercise in this subject.");
    await tx.query("SELECT id FROM class_groups WHERE id=$1 FOR UPDATE", [
      d.group,
    ]);
    const spent = (
      await tx.query<{ total: number }>(
        "SELECT coalesce(sum(xp_reward),0)::int total FROM professor_challenges WHERE group_id=$1 AND subject_id=$2 AND created_at>now()-interval '7 days'",
        [d.group, d.subject],
      )
    ).rows[0].total;
    if (spent + d.xp > 200)
      throw new HttpError(
        409,
        "This class and subject have a 200 XP publication limit per seven days.",
      );
    const id = randomUUID();
    await tx.query(
      "INSERT INTO professor_challenges(id,subject_id,group_id,created_by,title,instructions,due_at,question_id,xp_reward,academic) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        id,
        d.subject,
        d.group,
        u.id,
        d.title,
        d.instructions,
        d.deadline,
        d.question,
        d.xp,
        d.academic,
      ],
    );
    await audit(tx, u.id, "challenge.created", id, d);
    return id;
  });
}
async function challenge(db: Db, id: string) {
  const c = (
    await db.query<Challenge>(
      "SELECT * FROM professor_challenges WHERE id=$1 AND group_id IS NOT NULL FOR SHARE",
      [id],
    )
  ).rows[0];
  if (!c) throw new HttpError(404, "Challenge unavailable.");
  return c;
}
function eligible(c: Challenge, u: Profile) {
  if (u.role !== "student" || u.is_demo || u.group_id !== c.group_id)
    throw new HttpError(404, "Challenge unavailable.");
  if (new Date(c.due_at).getTime() <= Date.now())
    throw new HttpError(409, "The deadline has passed.");
}
export async function participate(
  db: Db,
  u: Profile,
  id: string,
  response: string,
) {
  return db.transaction(async (tx) => {
    const c = await challenge(tx, id);
    eligible(c, u);
    if (c.question_id) {
      const q = (
        await tx.query<{ lesson_id: string }>(
          `SELECT q.lesson_id FROM questions q JOIN lessons l ON l.id=q.lesson_id JOIN chapters ch ON ch.id=l.chapter_id WHERE q.id=$1 AND ch.subject_id=$2 AND ${visibleQuestion}`,
          [c.question_id, c.subject_id],
        )
      ).rows[0];
      if (!q) throw new HttpError(409, "This exercise has been withdrawn.");
      const fresh = await tx.query<{ id: string }>(
        "INSERT INTO study_sessions(id,user_id,subject_id,mode,question_ids,lesson_id,exercise_mode,challenge_id) VALUES($1,$2,$3,'practice',$4,$5,true,$6) ON CONFLICT DO NOTHING RETURNING id",
        [
          randomUUID(),
          u.id,
          c.subject_id,
          JSON.stringify([c.question_id]),
          q.lesson_id,
          id,
        ],
      );
      if (fresh.rows.length)
        await audit(tx, u.id, "challenge.started", id, { student: u.id });
      return (
        fresh.rows[0]?.id ??
        (
          await tx.query<{ id: string }>(
            "SELECT id FROM study_sessions WHERE user_id=$1 AND challenge_id=$2",
            [u.id, id],
          )
        ).rows[0].id
      );
    }
    const answer = z.string().trim().min(5).max(3000).parse(response);
    const r = await tx.query(
      "INSERT INTO challenge_submissions(challenge_id,student_id,status,response) VALUES($1,$2,'pending',$3) ON CONFLICT DO NOTHING RETURNING student_id",
      [id, u.id, answer],
    );
    if (!r.rows.length)
      throw new HttpError(409, "You already submitted this challenge.");
    await audit(tx, u.id, "challenge.submitted", id, {
      student: u.id,
      status: "pending",
      academic: c.academic,
    });
    return null;
  });
}
async function finish(
  tx: Db,
  c: Challenge,
  u: Profile,
  verifier: string,
  method: "exercise" | "manual",
  note: string,
) {
  const xp = c.xp_reward
    ? await award(
        tx,
        u,
        "verified-challenge:" + c.id,
        c.xp_reward,
        "Verified class challenge",
      )
    : 0;
  if (c.academic) {
    await tx.query(
      "INSERT INTO academic_rewards(id,challenge_id,user_id,status,verified_by,verified_at,verification_method) VALUES($1,$2,$3,'approved',$4,now(),$5)",
      [randomUUID(), c.id, u.id, verifier, method],
    );
  }
  await audit(
    tx,
    method === "exercise" ? null : verifier,
    method === "exercise" ? "challenge.auto_verified" : "challenge.approved",
    c.id,
    {
      student: u.id,
      author: c.created_by,
      method,
      status: "verified",
      reward: c.academic ? "academic" : "xp_only",
      xp,
      note,
    },
  );
  return xp;
}
// Runs inside the answer transaction; only the matching recorded correct attempt is evidence.
export async function verifyExercise(
  tx: Db,
  u: Profile,
  id: string,
  session: string,
) {
  const c = await challenge(tx, id);
  if (
    u.role !== "student" ||
    u.is_demo ||
    u.group_id !== c.group_id ||
    !c.question_id
  )
    return 0;
  const r = await tx.query(
    `INSERT INTO challenge_submissions(challenge_id,student_id,status,reviewed_at,reviewer)
 SELECT $1,$2,'verified',now(),$3 WHERE now()<=$4 AND EXISTS(SELECT 1 FROM study_sessions s JOIN question_attempts a ON a.session_id=s.id WHERE s.id=$5 AND s.challenge_id=$1 AND s.user_id=$2 AND a.user_id=$2 AND a.question_id=$6 AND a.correct AND a.created_at<=$4)
 ON CONFLICT DO NOTHING RETURNING student_id`,
    [id, u.id, c.created_by, c.due_at, session, c.question_id],
  );
  return r.rows.length
    ? finish(tx, c, u, c.created_by, "exercise", "Verified by linked exercise")
    : 0;
}
export async function reviewSubmission(
  db: Db,
  u: Profile,
  id: string,
  student: string,
  approve: boolean,
  note: string,
) {
  return db.transaction(async (tx) => {
    const c = await challenge(tx, id);
    await teachingScope(tx, u, c.group_id, c.subject_id);
    if (c.question_id || (u.role !== "admin" && u.id !== c.created_by))
      throw new HttpError(
        403,
        "Only the challenge author or an administrator can review this submission.",
      );
    const who = (
      await tx.query<Profile>(
        "SELECT id,role,group_id,timezone,is_demo FROM users WHERE id=$1 AND group_id=$2 AND role='student' AND NOT is_demo FOR SHARE",
        [student, c.group_id],
      )
    ).rows[0];
    if (!who) throw new HttpError(404, "Submission unavailable.");
    const reason = z
      .string()
      .trim()
      .max(500)
      .min(approve ? 0 : 3)
      .parse(note);
    const r = await tx.query(
      "UPDATE challenge_submissions SET status=$3,reviewer=$4,reviewed_at=now(),note=$5 WHERE challenge_id=$1 AND student_id=$2 AND submitted_at<=$6 AND status='pending' RETURNING student_id",
      [id, student, approve ? "verified" : "rejected", u.id, reason, c.due_at],
    );
    if (!r.rows.length)
      throw new HttpError(409, "No pending submission to review.");
    if (approve) await finish(tx, c, who, u.id, "manual", reason);
    else
      await audit(tx, u.id, "challenge.rejected", id, {
        student,
        status: "rejected",
        academic: c.academic,
        note: reason,
      });
  });
}
