import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/server/db";
import type { Profile } from "../src/lib/types";
import { readMigrations } from "../src/server/migrations";
import { seed } from "../src/server/seed";
import {
  fitPlan,
  topicPriority,
  countdown,
  readiness,
  type TopicSignal,
} from "../src/lib/study-plan";
import { dailyStudy, examOutlook } from "../src/server/study-plan";
import { adaptivePractice } from "../src/server/personalisation";
import { answerQuestion, advanceSession } from "../src/server/learning";
import {
  startMock,
  examData,
  updateMock,
  rateCard,
} from "../src/server/exam-prep";

test("deadlines and unresolved topics raise priority; readiness needs sustained evidence", () => {
  const base: TopicSignal = {
    topic: "Probability",
    lesson: "lesson",
    score: 40,
    group: "Priority",
    evidence: 2,
    rank: 0,
    last: Date.now(),
    reason: "",
    memory: [{ status: "Needs practice", count: 2 }],
  };
  const now = Date.now(),
    strong = { ...base, score: 90, group: "Strong", rank: 5, memory: [] };
  assert.ok(topicPriority(base, 2, now) > topicPriority(base, 9, now));
  assert.ok(topicPriority(base, 2, now) > topicPriority(strong, 2, now));
  assert.ok(
    topicPriority(base, null, now) >
      topicPriority({ ...base, memory: [] }, null, now),
  );
  assert.equal(readiness([{ ...base, evidence: 0, score: null }], []), null);
  const path = [1, 2, 3, 4, 5, 6].map((evidence) =>
    readiness([{ ...strong, evidence }], [])!,
  );
  assert.ok(
    path.every((p, i) => i === 0 || (p > path[i - 1] && p - path[i - 1] < 10)),
  );
  assert.ok(readiness([strong], [0])! >= readiness([strong], [])! - 4);
  assert.equal(
    countdown(
      "2026-11-05T23:05:00Z",
      "Africa/Lagos",
      new Date("2026-11-05T22:55:00Z"),
    ),
    1,
  );
});

test("daily plan follows real tasks, attempts, mocks and cards without crossing students or classes", async () => {
  const pg = await PGlite.create(),
    db = pg as unknown as Db;
  try {
    for (const m of await readMigrations()) await db.exec(m.sql);
    await seed(db);
    const u: Profile = {
      id: "planner",
      name: "Planner",
      email: "p@example.invalid",
      group_id: "group-a",
      role: "student",
      timezone: "Africa/Lagos",
      daily_goal: 30,
      is_demo: false,
    };
    const other = { ...u, id: "peer", group_id: "demo-group" };
    for (const p of [u, other])
      await db.query(
        "INSERT INTO users(id,name,email,group_id) VALUES($1,$1,$2,$3)",
        [p.id, p.id + "@test.invalid", p.group_id],
      );
    await db.query("DELETE FROM tasks");
    await db.query(
      `INSERT INTO tasks(id,group_id,subject_id,title,type,due_at) VALUES ('paper','group-a','statistics','Hand in worksheet','HOMEWORK',now()+interval '1 hour'),('exam','group-a','statistics','Statistics final','EXAM',now()+interval '2 days')`,
    );
    await db.query(
      "UPDATE questions SET topic='Probability' WHERE lesson_id='statistics-lesson'",
    );
    let plan = await dailyStudy(db, u);
    const first = fitPlan(plan.items, 10);
    assert.equal(first[0].id, "paper");
    assert.equal(
      first.reduce((s, i) => s + i.minutes, 0),
      10,
    );
    assert.equal(plan.nearest?.days, 2);
    assert.ok(
      !(await dailyStudy(db, other)).items.some((i) => i.id === "paper"),
    );
    assert.equal((await dailyStudy(db, other)).nearest, null);
    await db.query(
      "INSERT INTO task_completions(user_id,task_id) VALUES($1,'paper')",
      [u.id],
    );
    plan = await dailyStudy(db, u);
    assert.ok(plan.items.find((i) => i.id === "paper")?.done);
    const next = fitPlan(plan.items, 10)[0];
    assert.equal(next.subject, "statistics");
    assert.equal(next.kind, "practice");
    const session = await adaptivePractice(db, u, next.subject, {
      lesson: next.lesson!,
      topic: next.topic!,
      count: 2,
    });
    const resume = fitPlan((await dailyStudy(db, u)).items, 10)[0];
    assert.equal(resume.id, session);
    assert.ok(
      !(await dailyStudy(db, other)).items.some((i) => i.id === session),
    );
    const q = (
      await db.query<{ id: string; answer: number }>(
        "SELECT q.id,q.answer FROM questions q JOIN study_sessions s ON q.id=(s.question_ids->>0) WHERE s.id=$1",
        [session],
      )
    ).rows[0];
    await answerQuestion(db, u, session, q.id, q.answer);
    assert.equal((await advanceSession(db, u, session)).complete, false);
    const second = (
      await db.query<{ id: string; answer: number }>(
        "SELECT q.id,q.answer FROM questions q JOIN study_sessions s ON q.id=(s.question_ids->>1) WHERE s.id=$1",
        [session],
      )
    ).rows[0];
    assert.notEqual(q.id, second.id);
    await answerQuestion(db, u, session, second.id, second.answer);
    assert.equal((await advanceSession(db, u, session)).complete, true);
    plan = await dailyStudy(db, u);
    assert.ok(plan.items.find((i) => i.key === next.key)?.done);
    assert.ok(plan.completedKeys.includes("session:" + session));
    await rateCard(db, u, "statistics", q.id, "Good");
    const before = await examOutlook(db, u, "statistics");
    const mock = await startMock(db, u, "statistics", 5, 10);
    const item = (await examData(db, u, mock)).items[0];
    await updateMock(
      db,
      u,
      mock,
      true,
      item.id,
      (item.answer + 1) % item.options.length,
    );
    const after = await examOutlook(db, u, "statistics");
    assert.ok(
      after.score !== null &&
        before.score !== null &&
        after.score <= before.score &&
        before.score - after.score <= 8,
    );
    assert.equal((await examOutlook(db, other, "statistics")).score, null);
  } finally {
    await pg.close();
  }
});
