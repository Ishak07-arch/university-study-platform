import { randomUUID } from "node:crypto";
import type { Db } from "./db";
import type { Profile, Question } from "@/lib/types";
import { HttpError } from "./auth";
import { assertSubject, award } from "./learning";
import { checkAnswer, identifyMistake, visibleQuestion } from "./questions";

interface Exam {
  id: string;
  subject_id: string;
  deadline: Date | string;
  submitted_at: Date | string | null;
  correct_count: number;
  graded_count: number;
}
export interface Item extends Question {
  response: number | string | null;
  correct: boolean | null;
  position: number;
  occurrences:number;
}
const scope = `JOIN lessons l ON l.id=q.lesson_id JOIN chapters c ON c.id=l.chapter_id
 WHERE c.subject_id=$1 AND ($2=false OR q.origin='seed') AND ${visibleQuestion}`;
const pool = `FROM questions q ${scope}`;
export function solution(q: Question) {
  return q.question_type === "numeric"
    ? String(q.expected?.value)
    : q.question_type === "text"
      ? q.expected?.aliases?.[0] || ""
      : q.options[q.answer];
}
export async function prepHome(db: Db, u: Profile, subject: string) {
  await assertSubject(db, u, subject);
  const args = [subject, u.is_demo, u.id];
  const topics = (
    await db.query<{
      topic: string;
      lesson_id: string;
      weak: boolean;
      practised: boolean;
    }>(
      `SELECT q.topic,q.lesson_id,bool_or(EXISTS(SELECT 1 FROM mistakes m WHERE m.question_id=q.id AND m.user_id=$3 AND NOT corrected)) weak,
 bool_or(EXISTS(SELECT 1 FROM question_attempts a WHERE a.question_id=q.id AND a.user_id=$3) OR EXISTS(SELECT 1 FROM mock_items i JOIN mock_exams e ON e.id=i.exam_id WHERE i.question_id=q.id AND e.user_id=$3 AND i.correct IS NOT NULL AND i.response IS NOT NULL)) practised ${pool} GROUP BY q.topic,q.lesson_id ORDER BY weak DESC,practised,q.topic`,
      args,
    )
  ).rows;
  const cards = (
    await db.query<Question & {due:number}>(
      `SELECT q.*,count(*) over()::int due ${pool} AND NOT EXISTS(SELECT 1 FROM card_reviews r WHERE r.user_id=$3 AND r.question_id=q.id AND r.due_at>now()) ORDER BY q.id LIMIT 1`,
      args,
    )
  ).rows;
  const active = (
    await db.query<Exam>(
      "SELECT * FROM mock_exams WHERE user_id=$1 AND subject_id=$2 AND submitted_at IS NULL",
      [u.id, subject],
    )
  ).rows[0];
  return { topics, card: cards[0], due: cards[0]?.due ?? 0, active };
}
export async function rateCard(
  db: Db,
  u: Profile,
  subject: string,
  id: string,
  rating: string,
) {
  await assertSubject(db, u, subject);
  const seconds = (
    { Again: 60, Hard: 86400, Good: 345600 } as Record<string, number>
  )[rating];
  if (!Number.isInteger(seconds)) throw new HttpError(400, "Choose a rating.");
  await db.query(
    `INSERT INTO card_reviews(user_id,question_id,due_at,rating) SELECT $3,q.id,now()+$5::int*interval '1 second',$6 ${pool} AND q.id=$4
 ON CONFLICT(user_id,question_id) DO UPDATE SET due_at=excluded.due_at,rating=excluded.rating WHERE card_reviews.due_at<=now()`,
    [subject, u.is_demo, u.id, id, seconds, rating],
  );
}
export async function startMock(
  db: Db,
  u: Profile,
  subject: string,
  count: number,
  minutes: number,
) {
  if (![5, 10, 20].includes(count) || ![10, 30, 60].includes(minutes))
    throw new HttpError(400, "Choose an available exam length.");
  return db.transaction(async (tx) => {
    await assertSubject(tx, u, subject);
    await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [u.id]);
    const open = (
      await tx.query<Exam>(
        "SELECT id FROM mock_exams WHERE user_id=$1 AND subject_id=$2 AND submitted_at IS NULL",
        [u.id, subject],
      )
    ).rows[0];
    if (open) return open.id;
    const ids = (
      await tx.query<{ id: string }>(
        `WITH candidates AS (SELECT DISTINCT ON(lower(trim(q.prompt))) q.id,q.topic,q.difficulty,q.question_type,
 EXISTS(SELECT 1 FROM mistakes m WHERE m.user_id=$3 AND m.question_id=q.id AND NOT corrected) weak ${pool} AND q.exam_eligible ORDER BY lower(trim(q.prompt)),weak DESC,q.id),
 ranked AS (SELECT *,row_number() OVER(PARTITION BY topic ORDER BY weak DESC,random()) topic_rank,
 row_number() OVER(PARTITION BY question_type,difficulty ORDER BY random()) type_rank FROM candidates)
 SELECT id FROM ranked ORDER BY topic_rank,weak DESC,type_rank,random() LIMIT $4`,
        [subject, u.is_demo, u.id, count],
      )
    ).rows;
    if (!ids.length)
      throw new HttpError(409, "No exam questions are available yet.");
    const id = randomUUID();
    await tx.query(
      "INSERT INTO mock_exams(id,user_id,subject_id,deadline) VALUES($1,$2,$3,now()+$4::int*interval '1 minute')",
      [id, u.id, subject, minutes],
    );
    for (const [i, q] of ids.entries())
      await tx.query(
        "INSERT INTO mock_items(exam_id,question_id,position) VALUES($1,$2,$3)",
        [id, q.id, i],
      );
    return id;
  });
}
export async function examData(db: Db, u: Profile, id: string, lock = false) {
  const exam = (
    await db.query<Exam>(
      "SELECT * FROM mock_exams WHERE id=$1 AND user_id=$2" +
        (lock ? " FOR UPDATE" : ""),
      [id, u.id],
    )
  ).rows[0];
  if (!exam) throw new HttpError(404, "Exam unavailable.");
  await assertSubject(db, u, exam.subject_id);
  const items = (
    await db.query<Item>(
      `SELECT q.*,i.position,i.response,i.correct,(SELECT coalesce(sum(m.occurrences),0)::int FROM mistakes m WHERE m.user_id=$4 AND m.question_id=q.id) occurrences FROM mock_items i JOIN questions q ON q.id=i.question_id ${scope} AND q.exam_eligible AND i.exam_id=$3 ORDER BY i.position`,
      [exam.subject_id, u.is_demo, id,u.id],
    )
  ).rows;
  return { exam, items };
}
export async function updateMock(
  db: Db,
  u: Profile,
  id: string,
  finish: boolean,
  question?: string,
  input?: unknown,
) {
  return db.transaction(async (tx) => {
    const { exam, items } = await examData(tx, u, id, true);
    if (exam.submitted_at) return true;
    const expired = new Date(exam.deadline).getTime() <= Date.now();
    if (question && !expired) {
      const q = items.find((x) => x.id === question);
      if (!q) throw new HttpError(409, "This question was withdrawn.");
      checkAnswer(q, input);
      await tx.query(
        "UPDATE mock_items SET response=$3::jsonb WHERE exam_id=$1 AND question_id=$2",
        [id, q.id, JSON.stringify(input)],
      );
      q.response = input as string | number;
    }
    if (!expired && !finish) return false;
    let score = 0;
    for (const q of items) {
      const checked = q.response === null ? null : checkAnswer(q, q.response);
      if (checked?.correct) score++;
      else if (checked) {
        const pattern = identifyMistake(q, checked.value).category;
        await tx.query(
          "INSERT INTO mistakes(id,user_id,question_id,pattern) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,question_id,pattern) DO UPDATE SET occurrences=mistakes.occurrences+1,last_seen_at=now(),corrected=false,corrected_at=NULL",
          [randomUUID(), u.id, q.id, pattern],
        );
      }
      await tx.query(
        "UPDATE mock_items SET correct=$3 WHERE exam_id=$1 AND question_id=$2",
        [id, q.id, checked?.correct ?? false],
      );
    }
    await tx.query(
      "UPDATE mock_exams SET submitted_at=now(),correct_count=$2,graded_count=$3 WHERE id=$1",
      [id, score, items.length],
    );
    if (items.length && items.every((q) => q.response !== null))
      await award(
        tx,
        u,
        "mock:" + exam.subject_id,
        10,
        "Completed a mock exam",
      );
    return true;
  });
}
