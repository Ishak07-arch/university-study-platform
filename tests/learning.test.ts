import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { seed } from "../src/server/seed";
import type { Db } from "../src/server/db";
import type { Profile } from "../src/lib/types";
import {
  startSession,
  answerQuestion,
  advanceSession,
  streakFromDays,
  localDay,
} from "../src/server/learning";
import { hashPassword, checkPassword, requireAdmin } from "../src/server/auth";
import { createReminder, type ReminderInput } from "../src/server/tasks";
let pg: PGlite, db: Db;
const user: Profile = {
  id: "test-student",
  name: "Test Student",
  email: "test@example.invalid",
  role: "student",
  group_id: "group-a",
  daily_goal: 30,
  timezone: "Africa/Lagos",
  is_demo: false,
};
before(async () => {
  pg = await PGlite.create();
  db = pg as unknown as Db;
  await db.exec(await readFile("db/001-foundation.sql", "utf8"));
  await seed(db);
  await db.exec(await readFile("db/002-course-content.sql", "utf8"));
  await db.exec(await readFile("db/003-exercises.sql", "utf8"));
  await db.query(
    `INSERT INTO users(id,email,name,group_id) VALUES($1,$2,$3,$4)`,
    [user.id, user.email, user.name, user.group_id],
  );
});
after(async () => {
  await pg.close();
});
test("admin reminders target only their class group and create an audit record", async () => {
  const admin = { ...user, id: "test-admin", role: "admin" as const };
  await db.query(
    `INSERT INTO users(id,email,name,role,group_id) VALUES('test-admin','admin@example.invalid','Admin','admin','group-a')`,
  );
  await db.query(
    `INSERT INTO class_groups VALUES('group-b','semester-1','Group B')`,
  );
  const input: ReminderInput = {
    subject_id: "statistics",
    group_id: "group-b",
    title: "Bring your graph paper",
    description: "For the next tutorial.",
    type: "BRING",
    due_at: new Date().toISOString(),
    importance: 2,
  };
  await assert.rejects(createReminder(db, user, input), /administrators/);
  const id = await createReminder(db, admin, input);
  assert.equal(
    (
      await db.query("SELECT id FROM tasks WHERE id=$1 AND group_id=$2", [
        id,
        user.group_id,
      ])
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query("SELECT id FROM tasks WHERE id=$1 AND group_id=$2", [
        id,
        "group-b",
      ])
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await db.query(
        "SELECT id FROM audit_records WHERE entity_id=$1 AND actor_id=$2",
        [id, admin.id],
      )
    ).rows.length,
    1,
  );
  await assert.rejects(
    createReminder(db, admin, { ...input, group_id: "missing" }),
    /selected group/,
  );
  await assert.rejects(
    createReminder(db, admin, { ...input, group_id: "demo-group" }),
    /reserved for sample reminders/,
  );
});
test("demo checklist migration runs once and preserves later undo", async () => {
  await db.query(
    "INSERT INTO users(id,email,name,is_demo,group_id) VALUES('legacy-demo','legacy@example.invalid','Demo',true,'group-a')",
  );
  await db.query(
    "INSERT INTO task_completions(user_id,task_id) VALUES('legacy-demo','bring-calculator')",
  );
  await seed(db);
  assert.equal(
    (
      await db.query(
        "SELECT task_id FROM task_completions WHERE user_id='legacy-demo' AND task_id='demo-bring-calculator'",
      )
    ).rows.length,
    1,
  );
  await db.query(
    "DELETE FROM task_completions WHERE user_id='legacy-demo' AND task_id='demo-bring-calculator'",
  );
  await seed(db);
  assert.equal(
    (
      await db.query(
        "SELECT task_id FROM task_completions WHERE user_id='legacy-demo' AND task_id='demo-bring-calculator'",
      )
    ).rows.length,
    0,
  );
});
test("practice cannot skip questions, access another student session, or farm XP", async () => {
  const id = await startSession(db, user, "statistics", "practice");
  assert.equal(await startSession(db, user, "statistics", "practice"), id);
  await assert.rejects(advanceSession(db, user, id), /Answer this question/);
  await assert.rejects(
    answerQuestion(db, { ...user, id: "other-user" }, id, "statistics-1", 1),
    /moved on/,
  );
  await assert.rejects(
    answerQuestion(db, user, id, "statistics-4", 2),
    /moved on/,
  );
  const wrong = await answerQuestion(db, user, id, "statistics-1", 0);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.xp, 0);
  assert.equal(wrong.explanation, "");
  const correct = await answerQuestion(db, user, id, "statistics-1", 1);
  assert.equal(correct.xp, 7);
  const repeat = await answerQuestion(db, user, id, "statistics-1", 1);
  assert.equal(repeat.xp, 0);
  await advanceSession(db, user, id);
  for (const [qid, selected] of [
    ["statistics-2", 1],
    ["statistics-3", 1],
    ["statistics-4", 2],
  ] as const) {
    assert.equal((await answerQuestion(db, user, id, qid, selected)).xp, 5);
    await advanceSession(db, user, id);
  }
  assert.deepEqual(await advanceSession(db, user, id), {
    complete: true,
    xp: 0,
  });
  const replay = await startSession(db, user, "statistics", "practice");
  let replayXp = 0;
  for (const [qid, selected] of [
    ["statistics-1", 1],
    ["statistics-2", 1],
    ["statistics-3", 1],
    ["statistics-4", 2],
  ] as const) {
    replayXp += (await answerQuestion(db, user, replay, qid, selected)).xp;
    replayXp += (await advanceSession(db, user, replay)).xp;
  }
  assert.equal(replayXp, 0);
  const total = (
    await db.query<{ n: number }>(
      "SELECT sum(amount)::int n FROM xp_events WHERE user_id=$1",
      [user.id],
    )
  ).rows[0].n;
  assert.equal(total, 32);
});
test("concurrent answer requests award XP exactly once", async () => {
  const id = await startSession(db, user, "microeconomics", "practice");
  const results = await Promise.all([
    answerQuestion(db, user, id, "microeconomics-1", 2),
    answerQuestion(db, user, id, "microeconomics-1", 2),
  ]);
  assert.equal(
    results.reduce((sum, r) => sum + r.xp, 0),
    5,
  );
});
test("quick review has a bounded question set and grants completion once", async () => {
  const id = await startSession(db, user, "mathematics", "review", 5);
  await answerQuestion(db, user, id, "mathematics-1", 2);
  assert.equal((await advanceSession(db, user, id)).complete, false);
  await answerQuestion(db, user, id, "mathematics-2", 1);
  assert.deepEqual(await advanceSession(db, user, id), {
    complete: true,
    xp: 8,
  });
  assert.equal((await advanceSession(db, user, id)).xp, 0);
});
test("students cannot access subjects in another semester or admin actions", async () => {
  await assert.rejects(
    startSession(
      db,
      { ...user, group_id: "missing-group" },
      "statistics",
      "practice",
    ),
    /not part of your semester/,
  );
  assert.throws(() => requireAdmin(user), /administrators/);
});
test("streak has a one-day grace period and respects timezone dates", () => {
  assert.equal(streakFromDays(["2026-10-24", "2026-10-25"], "2026-10-26"), 2);
  assert.equal(streakFromDays(["2026-10-24"], "2026-10-26"), 0);
  assert.equal(streakFromDays(["2026-10-25", "2026-10-26"], "2026-10-26"), 2);
  assert.equal(
    localDay("Africa/Lagos", new Date("2026-10-25T23:30:00Z")),
    "2026-10-26",
  );
});
test("passwords use unique salts and reject incorrect passwords", async () => {
  const first = await hashPassword("a secure test password");
  const second = await hashPassword("a secure test password");
  assert.notEqual(first, second);
  assert.equal(await checkPassword("a secure test password", first), true);
  assert.equal(await checkPassword("wrong password", first), false);
});
