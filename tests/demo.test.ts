import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/server/db";
import type { Profile } from "../src/lib/types";
import { readMigrations, migrateHosted } from "../src/server/migrations";
import { seed, seedDemo } from "../src/server/seed";
import { answerQuestion, startSession } from "../src/server/learning";
import { completeReminder } from "../src/server/tasks";
import { rateCard, startMock, updateMock } from "../src/server/exam-prep";
import { audit } from "../src/server/auth";
import {
  assertDemoCapacity,
  purgeExpiredDemoUsers,
} from "../src/server/demo";

let pg: PGlite, db: Db;
const owned = [
  ["mock_exams", "user_id"],
  ["xp_events", "user_id"],
  ["question_attempts", "user_id"],
  ["task_completions", "user_id"],
  ["study_days", "user_id"],
  ["mistakes", "user_id"],
  ["user_achievements", "user_id"],
  ["card_reviews", "user_id"],
  ["first_exposures", "user_id"],
  ["weekly_learning", "user_id"],
  ["study_sessions", "user_id"],
  ["auth_sessions", "user_id"],
  ["users", "id"],
] as const;
const rowsFor = async (id: string) => {
  const counts: Record<string, number> = {};
  for (const [table, column] of owned)
    counts[table] = (
      await db.query<{ n: number }>(
        `SELECT count(*)::int n FROM ${table} WHERE ${column}=$1`,
        [id],
      )
    ).rows[0].n;
  return counts;
};
async function demoUser(id: string, hoursOld: number): Promise<Profile> {
  await db.query(
    `INSERT INTO users(id,email,name,group_id,is_demo,daily_goal,created_at) VALUES($1,$2,'Alex Johnson','demo-group',true,40,now()-$3::int*interval '1 hour')`,
    [id, id + "@demo.invalid", hoursOld],
  );
  await seedDemo(db, id);
  await db.query(
    "INSERT INTO auth_sessions VALUES($1,$2,now()+interval '14 days')",
    ["token-" + id, id],
  );
  return {
    id,
    name: "Alex Johnson",
    email: id + "@demo.invalid",
    role: "student",
    group_id: "demo-group",
    daily_goal: 40,
    timezone: "Africa/Lagos",
    is_demo: true,
  };
}
// Exercises every demo-reachable write path, including trigger-maintained rows.
async function study(u: Profile) {
  const session = await startSession(db, u, "statistics", "practice");
  const s = (
    await db.query<{ question_ids: string[]; position: number }>(
      "SELECT question_ids,position FROM study_sessions WHERE id=$1",
      [session],
    )
  ).rows[0];
  const q = (
    await db.query<{ id: string; answer: number; options: string[] }>(
      "SELECT id,answer,options FROM questions WHERE id=$1",
      [s.question_ids[s.position]],
    )
  ).rows[0];
  await answerQuestion(db, u, session, q.id, (q.answer + 1) % q.options.length);
  await answerQuestion(db, u, session, q.id, q.answer);
  const task = (
    await db.query<{ id: string }>(
      "SELECT id FROM tasks WHERE group_id=$1 AND type='HOMEWORK' LIMIT 1",
      [u.group_id],
    )
  ).rows[0];
  if (task) await completeReminder(db, u, task.id, true);
  await rateCard(db, u, "statistics", q.id, "Good");
  await updateMock(db, u, await startMock(db, u, "statistics", 5, 10), true);
}

before(async () => {
  pg = await PGlite.create();
  db = pg as unknown as Db;
  await migrateHosted(db, await readMigrations());
  await seed(db);
});
after(async () => {
  await pg.close();
});

test("expired demo accounts and everything they own are purged; real and fresh accounts are untouched", async () => {
  const expired = await demoUser("demo-expired", 25);
  const fresh = await demoUser("demo-fresh", 1);
  await study(expired);
  await study(fresh);
  await db.query(
    "INSERT INTO users(id,email,name,group_id) VALUES('real','real@test.invalid','Real Student','group-a')",
  );
  const real: Profile = {
    ...expired,
    id: "real",
    email: "real@test.invalid",
    name: "Real Student",
    group_id: "group-a",
    is_demo: false,
  };
  await study(real);
  // Real accounts are never selected, regardless of age.
  await db.query(
    "UPDATE users SET created_at=now()-interval '400 days' WHERE id='real'",
  );
  const before = { fresh: await rowsFor("demo-fresh"), real: await rowsFor("real") };
  for (const key of ["question_attempts", "mistakes", "mock_exams", "card_reviews"])
    assert.ok((await rowsFor("demo-expired"))[key] > 0, key);

  assert.equal(await purgeExpiredDemoUsers(db), 1);
  assert.ok(Object.values(await rowsFor("demo-expired")).every((n) => n === 0));
  assert.equal(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM mock_items i LEFT JOIN mock_exams e ON e.id=i.exam_id WHERE e.id IS NULL",
      )
    ).rows[0].n,
    0,
  );
  assert.deepEqual(await rowsFor("demo-fresh"), before.fresh);
  assert.deepEqual(await rowsFor("real"), before.real);
  assert.equal(await purgeExpiredDemoUsers(db), 0);
});

test("an unexpected reference aborts the whole batch instead of partially deleting", async () => {
  await demoUser("demo-audited", 30);
  await audit(db, "demo-audited", "test.reference", "x");
  const before = await rowsFor("demo-audited");
  assert.equal(await purgeExpiredDemoUsers(db), 0);
  assert.deepEqual(await rowsFor("demo-audited"), before);
});

test("demo capacity is bounded", async () => {
  const { n } = (
    await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM users WHERE is_demo=true",
    )
  ).rows[0];
  await assertDemoCapacity(db, n + 1);
  await assert.rejects(assertDemoCapacity(db, n), /demo is busy/);
});
