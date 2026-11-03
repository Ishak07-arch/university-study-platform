import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/server/db";
import type { Profile } from "../src/lib/types";
import { readMigrations } from "../src/server/migrations";
import { seed } from "../src/server/seed";
import {
  assess,
  adaptivePractice,
  subjectProgress,
} from "../src/server/personalisation";
import {
  startSession,
  answerQuestion,
  advanceSession,
} from "../src/server/learning";
import { startMock, examData, updateMock } from "../src/server/exam-prep";

test("recent independent answers move difficulty gradually and stale evidence loses confidence", () => {
  const now = Date.now(),
    qs = [1, 2, 3].map((d) => ({
      id: "q" + d,
      lesson_id: "l",
      topic: "Variance",
      difficulty: d,
      recent_good: false,
    }));
  const event = (i: number, correct: boolean, d = 1) => ({
    question_id: "q" + d,
    correct,
    exercise: String(i),
    at: new Date(now - i * 1000),
    exam: null,
    retry: false,
  });
  const easy = [0, 1, 2].map((i) => event(i, true));
  assert.equal(assess(qs, easy.slice(0, 1), [], now).target, 1);
  assert.equal(assess(qs, easy, [], now).question, "q2");
  assert.equal(
    assess(
      qs,
      [0, 1, 2].map((i) => event(i, true, 2)),
      [],
      now,
    ).target,
    3,
  );
  const failed = assess(qs, [event(0, false, 2), event(1, false, 2)], [], now);
  assert.equal(failed.group, "Priority");
  assert.equal(failed.question, "q1");
  assert.ok(
    assess(qs, easy, [], now + 90 * 86400000).score! <
      assess(qs, easy, [], now).score!,
  );
  assert.equal(
    assess(
      qs.map((q) => ({ ...q, recent_good: true })),
      [],
      [],
      now,
    ).score,
    null,
  );
});

test("submitted exams, recurrence, recovery and adaptive practice stay scoped to the learner", async () => {
  const pg = await PGlite.create(),
    db = pg as unknown as Db;
  try {
    for (const m of await readMigrations()) await db.exec(m.sql);
    await seed(db);
    const u: Profile = {
      id: "learner",
      name: "Learner",
      email: "learner@test.invalid",
      role: "student",
      group_id: "group-a",
      timezone: "UTC",
      daily_goal: 30,
      is_demo: false,
    };
    const other = { ...u, id: "other" };
    for (const p of [u, other])
      await db.query(
        "INSERT INTO users(id,name,email,group_id) VALUES($1,$1,$2,$3)",
        [p.id, p.id + "@test.invalid", p.group_id],
      );
    const subject = "statistics",
      id = await startMock(db, u, subject, 5, 10),
      q = (await examData(db, u, id)).items[0],
      wrong = (q.answer + 1) % q.options.length;
    await updateMock(db, u, id, false, q.id, wrong);
    assert.ok(
      (await subjectProgress(db, u, subject)).every((t) => t.score === null),
    );
    await updateMock(db, u, id, true);
    let [topic] = await subjectProgress(db, u, subject);
    assert.equal(topic.topic, q.topic);
    assert.equal(topic.memory[0].count, 1);
    const session = await adaptivePractice(db, u, subject);
    assert.equal(
      (
        await db.query<{ question_ids: string[] }>(
          "SELECT question_ids FROM study_sessions WHERE id=$1",
          [session],
        )
      ).rows[0].question_ids[0],
      q.id,
    );
    await answerQuestion(db, u, session, q.id, wrong);
    [topic] = await subjectProgress(db, u, subject);
    assert.equal(topic.group, "Priority");
    assert.equal(topic.memory[0].count, 2);
    const low = topic.score!;
    await answerQuestion(db, u, session, q.id, q.answer);
    await advanceSession(db, u, session);
    for (let i = 0; i < 3; i++) {
      const next = await startSession(
        db,
        u,
        subject,
        "practice",
        10,
        q.lesson_id,
        q.id,
      );
      await answerQuestion(db, u, next, q.id, q.answer);
      await advanceSession(db, u, next);
    }
    const recovered = (await subjectProgress(db, u, subject)).find(
      (t) => t.topic === q.topic,
    )!;
    assert.ok(recovered.score! > low);
    assert.equal(recovered.memory[0].status, "Resolved");
    assert.equal(
      (
        await db.query<{ recovery_steps: number }>(
          "SELECT recovery_steps FROM mistakes WHERE user_id=$1 AND question_id=$2",
          [u.id, q.id],
        )
      ).rows[0].recovery_steps,
      3,
    );
    assert.ok(
      (await subjectProgress(db, other, subject)).every(
        (t) => !t.memory.length && t.score === null,
      ),
    );
    assert.equal(
      (
        await db.query(
          "SELECT id FROM xp_events WHERE user_id=$1 AND event_key LIKE 'question:%'",
          [u.id],
        )
      ).rows.length,
      1,
    );
    await assert.rejects(
      subjectProgress(db, { ...u, group_id: "missing" }, subject),
      /semester/,
    );
  } finally {
    await pg.close();
  }
});
