import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/server/db";
import type { Profile } from "../src/lib/types";
import { seed } from "../src/server/seed";
import { readMigrations } from "../src/server/migrations";
import { completeReminder } from "../src/server/tasks";
import { periodLeaders, motivation } from "../src/server/motivation";
import { weeklyLeague } from "../src/lib/leagues";
import {
  answerQuestion,
  startSession,
  advanceSession,
} from "../src/server/learning";
test("class rankings, milestones and weekly bonuses use verified unique activity", async () => {
  const pg = await PGlite.create(),
    db = pg as unknown as Db;
  try {
    for (const m of await readMigrations()) await db.exec(m.sql);
    await seed(db);
    const u: Profile = {
      id: "learner",
      name: "Learner",
      email: "private@example.invalid",
      role: "student",
      is_demo: false,
      group_id: "group-a",
      daily_goal: 30,
      timezone: "UTC",
    };
    const other = { ...u, id: "outside", group_id: "demo-group" };
    for (const p of [u, other, { ...u, id: "peer" }])
      await db.query(
        "INSERT INTO users(id,email,name,group_id) VALUES($1,$2,$1,$3)",
        [p.id, p.id + "@example.invalid", p.group_id],
      );
    const count = async (sql: string) =>
      (await db.query<{ n: number }>(sql)).rows[0].n;
    await motivation(db, u);
    await periodLeaders(db, u, "week");
    assert.equal(await count("SELECT count(*)::int n FROM study_days"), 0);
    await db.query(
      "INSERT INTO tasks(id,group_id,subject_id,title,type,due_at) VALUES('hw','group-a','statistics','Homework','HOMEWORK',now())",
    );
    await assert.rejects(completeReminder(db, other, "hw", true), /not found/);
    for (const state of [true, true, false, true])
      await completeReminder(db, u, "hw", state);
    assert.equal(await count("SELECT sum(amount)::int n FROM xp_events"), 3);
    const qs = (
      await db.query<{
        id: string;
        answer: number;
        lesson_id: string;
        subject_id: string;
      }>(
        "SELECT q.id,q.answer,q.lesson_id,c.subject_id FROM questions q JOIN lessons l ON l.id=q.lesson_id JOIN chapters c ON c.id=l.chapter_id ORDER BY q.id LIMIT 9",
      )
    ).rows;
    // Earlier successful families establish eligibility without rewarding a low baseline.
    await db.query(
      "INSERT INTO first_exposures SELECT $1,'prior-'||n,'old','Baseline',true,now()-interval '9 days' FROM generate_series(1,3) n",
      [u.id],
    );
    for (const [i, q] of qs.slice(0, 6).entries()) {
      await db.query(
        "UPDATE questions SET topic='Learning group' WHERE id=$1",
        [q.id],
      );
      const session = await startSession(
        db,
        u,
        q.subject_id,
        "practice",
        10,
        q.lesson_id,
        q.id,
      );
      if (i === 0)
        assert.equal(
          await count(
            "SELECT count(*)::int n FROM user_achievements WHERE achievement_id='first-session'",
          ),
          0,
        );
      assert.equal(
        (await answerQuestion(db, u, session, q.id, q.answer)).xp,
        5,
      );
      assert.equal(
        (await answerQuestion(db, u, session, q.id, q.answer)).xp,
        0,
      );
      await advanceSession(db, u, session);
      if (i === 2) assert.equal((await motivation(db, u)).improved.length, 0);
    }
    const m = await motivation(db, u);
    assert.equal(m.progress.solved, 6);
    assert.equal(m.improved[0].is_you, true);
    assert.deepEqual(Object.keys(m.improved[0]).sort(), [
      "is_you",
      "name",
      "rank",
    ]);
    assert.equal(
      await count(
        "SELECT count(*)::int n FROM xp_events WHERE event_key LIKE 'challenge:solve:%'",
      ),
      1,
    );
    assert.equal(m.badges.filter((x) => x.name === "First session").length, 1);
    assert.equal(m.badges.filter((x) => x.name === "Homework hero").length, 1);
    // Simulate revisiting the content on a day with no activity record yet.
    await db.query("DELETE FROM study_days WHERE user_id=$1", [u.id]);
    const q = qs[0],
      again = await startSession(
        db,
        u,
        q.subject_id,
        "review",
        5,
        q.lesson_id,
        q.id,
      );
    assert.equal((await answerQuestion(db, u, again, q.id, q.answer)).xp, 0);
    assert.equal((await advanceSession(db, u, again)).xp, 0);
    assert.equal((await motivation(db, u)).progress.solved, 6);
    assert.equal(await count("SELECT count(*)::int n FROM study_days"), 1);
    const mistake = qs[6];
    const drill = await startSession(
      db,
      u,
      mistake.subject_id,
      "practice",
      10,
      mistake.lesson_id,
      mistake.id,
    );
    await answerQuestion(db, u, drill, mistake.id, (mistake.answer + 1) % 4);
    await answerQuestion(db, u, drill, mistake.id, mistake.answer);
    assert.equal((await motivation(db, u)).progress.solved, 6);
    const board = await periodLeaders(db, u, "week");
    assert.equal(board[0].rank, 1);
    assert.equal(board[0].is_you, true);
    assert.ok(board.every((l) => l.name !== other.id));
    assert.equal((await motivation(db, other)).badges.length, 0);
    assert.equal((await motivation(db, other)).improved.length, 0);
    assert.ok(board[0].xp >= 50);
    assert.equal(weeklyLeague(board[0].xp), "Gold");
    await db.query(
      "UPDATE xp_events SET created_at=created_at-interval '8 days'",
    );
    assert.equal(
      weeklyLeague((await periodLeaders(db, u, "week"))[0].xp),
      "Bronze",
    );
  } finally {
    await pg.close();
  }
});
