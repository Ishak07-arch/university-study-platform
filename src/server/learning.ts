import { randomUUID } from "node:crypto";
import type { Db } from "./db";
import type { Profile, Mode, StudySession, Question } from "@/lib/types";
import { HttpError } from "./auth";
import { subjectsSeed } from "./seed";
import {
  availableQuestion,
  checkAnswer,
  identifyMistake,
  visibleQuestion,
} from "./questions";
export function localDay(timezone: string, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
}
export function streakFromDays(days: string[], today: string) {
  const set = new Set(days);
  let cursor = new Date(today + "T12:00:00Z");
  if (!set.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let n = 0;
  while (set.has(cursor.toISOString().slice(0, 10))) {
    n++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return n;
}
export async function award(
  tx: Db,
  user: Profile,
  key: string,
  amount: number,
  reason: string,
  sessionId?: string,
) {
  const { rows } = await tx.query<{ id: string }>(
    "INSERT INTO xp_events(id,user_id,event_key,reason,amount,reward_session) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,event_key) DO NOTHING RETURNING id",
    [randomUUID(), user.id, key, reason, amount, sessionId ?? null],
  );
  if (rows.length) {
    await tx.query(
      "INSERT INTO study_days(user_id,day) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [user.id, localDay(user.timezone)],
    );
    return amount;
  }
  return 0;
}
export async function assertSubject(tx: Db, user: Profile, subject: string) {
  if (user.is_demo && !subjectsSeed.some((s) => s[0] === subject))
    throw new HttpError(404, "This subject is not available in the demo.");
  const r = await tx.query(
    `SELECT s.id FROM subjects s JOIN class_groups g ON g.semester_id=s.semester_id WHERE s.id=$1 AND g.id=$2`,
    [subject, user.group_id],
  );
  if (!r.rows.length)
    throw new HttpError(404, "This subject is not part of your semester.");
}
export async function startSession(
  db: Db,
  user: Profile,
  subject: string,
  mode: Mode,
  minutes = 10,
  lessonId?: string,
  preferredId?: string,
  planned?: { topic: string; count: number; difficulty: number },
) {
  return db.transaction(async (tx) => {
    await assertSubject(tx, user, subject);
    if (
      lessonId &&
      !(
        await tx.query(
          "SELECT l.id FROM lessons l JOIN chapters c ON c.id=l.chapter_id WHERE l.id=$1 AND c.subject_id=$2",
          [lessonId, subject],
        )
      ).rows.length
    )
      throw new HttpError(400, "Choose a lesson in this subject.");
    if (preferredId) {
      const q = await availableQuestion(tx, user, preferredId);
      if (!q || q.lesson_id !== lessonId)
        throw new HttpError(404, "This exercise is no longer available.");
    }
    await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
    const active = await tx.query<StudySession>(
      "SELECT * FROM study_sessions WHERE user_id=$1 AND subject_id=$2 AND mode=$3 AND completed_at IS NULL AND lesson_id IS NOT DISTINCT FROM $4::text AND ($5::text IS NULL OR question_ids->>0=$5) ORDER BY updated_at DESC LIMIT 1",
      [user.id, subject, mode, lessonId || null, preferredId || null],
    );
    if (active.rows.length) return active.rows[0].id;
    const n =
      mode === "review" ? (minutes === 5 ? 2 : minutes === 20 ? 4 : 3) : 4;
    const q = await tx.query<{ id: string }>(
      `SELECT q.id FROM questions q JOIN lessons l ON q.lesson_id=l.id JOIN chapters c ON l.chapter_id=c.id WHERE c.subject_id=$1 AND ${visibleQuestion} AND ($3::text IS NULL OR q.lesson_id=$3) AND ($4::text IS NULL OR q.id=$4 OR q.topic=$7::text) AND ($6=false OR q.origin='seed') ORDER BY (q.id=$4) DESC NULLS LAST,abs(q.difficulty-$8::int),
      (SELECT max(m.last_seen_at) FROM mistakes m JOIN questions mq ON mq.id=m.question_id WHERE m.user_id=$5 AND mq.lesson_id=q.lesson_id AND mq.topic=q.topic AND m.corrected=false) DESC NULLS LAST,
      EXISTS(SELECT 1 FROM question_attempts a WHERE a.user_id=$5 AND a.question_id=q.id AND a.correct=false) DESC,
      q.id LIMIT $2`,
      [
        subject,
        preferredId ? (planned?.count ?? 1) : n,
        lessonId || null,
        preferredId || null,
        user.id,
        user.is_demo,
        planned?.topic ?? null,
        planned?.difficulty ?? null,
      ],
    );
    if (!q.rows.length)
      throw new HttpError(
        400,
        "Exercises for this subject are being prepared. Try a lesson instead.",
      );
    const id = randomUUID();
    await tx.query(
      "INSERT INTO study_sessions(id,user_id,subject_id,mode,question_ids,lesson_id,exercise_mode) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        id,
        user.id,
        subject,
        mode,
        JSON.stringify(q.rows.map((q) => q.id)),
        lessonId || null,
        !!lessonId ||
          (
            await tx.query(
              "SELECT id FROM questions WHERE id=ANY($1::text[]) AND origin<>'seed'",
              [q.rows.map((q) => q.id)],
            )
          ).rows.length > 0,
      ],
    );
    return id;
  });
}
export async function answerQuestion(
  db: Db,
  user: Profile,
  sessionId: string,
  questionId: string,
  selected: number | string,
) {
  return db.transaction(async (tx) => {
    const s = (
      await tx.query<StudySession>(
        "SELECT * FROM study_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [sessionId, user.id],
      )
    ).rows[0];
    if (!s || s.completed_at || s.question_ids[s.position] !== questionId)
      throw new HttpError(
        409,
        "Your session has moved on. Refresh to continue.",
      );
    const q = await availableQuestion(tx, user, questionId);
    if (!q)
      throw new HttpError(
        409,
        "This exercise is no longer available. Reload to continue with another question.",
      );
    const checked = checkAnswer(q, selected);
    const attempts = (
      await tx.query<{ correct: boolean }>(
        "SELECT correct FROM question_attempts WHERE session_id=$1 AND question_id=$2",
        [sessionId, questionId],
      )
    ).rows;
    if (attempts.some((a) => a.correct))
      return {
        correct: true,
        xp: 0,
        explanation: q.explanation,
        mistake: q.mistake,
      };
    const correct = checked.correct;
    await tx.query(
      "INSERT INTO question_attempts(id,user_id,session_id,question_id,selected,correct,answer_value,attempt_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        randomUUID(),
        user.id,
        sessionId,
        questionId,
        checked.selected,
        correct,
        JSON.stringify(checked.value),
        attempts.length + 1,
      ],
    );
    const mistake = identifyMistake(q, checked.value);
    if (!correct)
      await tx.query(
        `INSERT INTO mistakes(id,user_id,question_id,pattern) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,question_id,pattern) DO UPDATE SET occurrences=mistakes.occurrences+1,last_seen_at=now(),corrected=false,corrected_at=NULL`,
        [randomUUID(), user.id, questionId, mistake.category],
      );
    else
      await tx.query(
        "UPDATE mistakes SET corrected=true,corrected_at=now() WHERE user_id=$1 AND question_id=$2",
        [user.id, questionId],
      );
    const repeated =
      !correct &&
      (
        await tx.query<{ n: number }>(
          `SELECT COALESCE(sum(m.occurrences),0)::int n FROM mistakes m JOIN questions q ON q.id=m.question_id WHERE m.user_id=$1 AND q.lesson_id=$2 AND q.topic=$3 AND m.pattern=$4`,
          [user.id, q.lesson_id, q.topic, mistake.category],
        )
      ).rows[0].n >= 2;
    const previous = (
      await tx.query<{ n: number }>(
        "SELECT count(*)::int n FROM question_attempts a JOIN questions q ON q.id=a.question_id WHERE a.user_id=$1 AND coalesce(q.reward_key,q.id)=$2 AND a.correct=false",
        [user.id, q.reward_key || questionId],
      )
    ).rows[0].n;
    let xp = correct
      ? await award(
          tx,
          user,
          "question:" + (q.reward_key || questionId),
          previous > 0 ? 7 : 5,
          previous > 0 ? "Corrected a mistake" : "Correct on first attempt",
          sessionId,
        )
      : 0;
    // Reading an explanation is free. Only a new, unaided practice solve can
    // verify recovery from an answered mistake in a previously submitted mock.
    if (
      xp &&
      attempts.length === 0 &&
      (
        await tx.query(
          "SELECT 1 FROM mock_items i JOIN mock_exams e ON e.id=i.exam_id WHERE e.user_id=$1 AND e.submitted_at IS NOT NULL AND e.submitted_at<(SELECT created_at FROM study_sessions WHERE id=$3) AND i.question_id=$2 AND i.correct=false AND i.response IS NOT NULL LIMIT 1",
          [user.id, questionId, sessionId],
        )
      ).rows.length
    )
      xp += await award(
        tx,
        user,
        "exam-review:" + s.subject_id,
        2,
        "Corrected a mock exam mistake",
      );
    return {
      correct,
      xp,
      explanation: correct ? q.explanation : "",
      mistake: correct
        ? ""
        : q.origin === "seed"
          ? q.mistake
          : mistake.feedback,
      repeated,
    };
  });
}
export async function advanceSession(db: Db, user: Profile, id: string) {
  return db.transaction(async (tx) => {
    const s = (
      await tx.query<StudySession>(
        "SELECT * FROM study_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [id, user.id],
      )
    ).rows[0];
    if (!s) throw new HttpError(404, "Study session not found.");
    if (s.completed_at) return { complete: true, xp: 0 };
    const available = await availableQuestion(
      tx,
      user,
      s.question_ids[s.position],
    );
    const a = await tx.query(
      "SELECT id FROM question_attempts WHERE session_id=$1 AND question_id=$2 AND correct=true",
      [id, s.question_ids[s.position]],
    );
    if (!a.rows.length && available)
      throw new HttpError(
        400,
        "Answer this question correctly before continuing.",
      );
    const complete = s.position + 1 === s.question_ids.length;
    await tx.query(
      "UPDATE study_sessions SET position=position+1,updated_at=now(),completed_at=CASE WHEN $2 THEN now() ELSE NULL END,skipped=skipped+$3 WHERE id=$1",
      [id, complete, available ? 0 : 1],
    );
    const xp =
      complete &&
      available &&
      !s.skipped &&
      (
        await tx.query(
          "SELECT 1 FROM xp_events WHERE reward_session=$1 AND user_id=$2 LIMIT 1",
          [id, user.id],
        )
      ).rows.length > 0
        ? await award(
            tx,
            user,
            s.exercise_mode
              ? "exercise-session:" + s.subject_id
              : "session:" + s.mode + ":" + s.question_ids.join(","),
            s.mode === "review" ? 8 : 10,
            s.mode === "review"
              ? "Finished a quick review"
              : "Completed a study session",
          )
        : 0;
    return { complete, xp };
  });
}
