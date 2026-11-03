import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readMigrations } from "../src/server/migrations";
import {
  startMock,
  examData,
  updateMock,
  prepHome,
  rateCard,
} from "../src/server/exam-prep";
import { seed } from "../src/server/seed";
import type { Db } from "../src/server/db";
import type { Profile } from "../src/lib/types";

test("mock exams preserve answers, mark once on submission or expiry and schedule cards per student", async () => {
  const pg = await PGlite.create(),
    db = pg as unknown as Db;
  try {
    for (const m of await readMigrations()) await db.exec(m.sql);
    await seed(db);
    const u: Profile = {
      id: "exam-user",
      email: "exam@test.invalid",
      name: "Student",
      role: "student",
      group_id: "group-a",
      timezone: "UTC",
      daily_goal: 30,
      is_demo: false,
    };
    await db.query(
      "INSERT INTO users(id,email,name,group_id) VALUES($1,$2,$3,$4)",
      [u.id, u.email, u.name, u.group_id],
    );
    const subject = "statistics",
      id = await startMock(db, u, subject, 10, 30);
    assert.equal(await startMock(db, u, subject, 10, 30), id);
    await assert.rejects(
      updateMock(db, { ...u, id: "other" }, id, true),
      /unavailable/,
    );
    const { items } = await examData(db, u, id);
    assert.ok(items.length > 1);
    assert.equal(new Set(items.map((i) => i.prompt)).size, items.length);
    for (const [i, q] of items.entries())
      await updateMock(
        db,
        u,
        id,
        false,
        q.id,
        i ? q.answer : (q.answer + 1) % q.options.length,
      );
    const saved = await examData(db, u, id);
    assert.ok(
      saved.items.every((i) => i.correct === null && i.response !== null),
    );
    assert.equal((await db.query("SELECT * FROM xp_events")).rows.length, 0);
    await updateMock(db, u, id, true);
    await updateMock(db, u, id, true);
    const result = await examData(db, u, id);
    assert.equal(result.exam.correct_count, items.length - 1);
    assert.equal(result.exam.graded_count, items.length);
    assert.equal(
      (
        await db.query<{ occurrences: number }>(
          "SELECT occurrences FROM mistakes",
        )
      ).rows[0].occurrences,
      1,
    );
    assert.equal((await db.query("SELECT * FROM xp_events")).rows.length, 1);
    const again = await startMock(db, u, subject, 10, 10);
    await db.query(
      "UPDATE mock_exams SET deadline=now()-interval '1 minute' WHERE id=$1",
      [again],
    );
    await updateMock(db, u, again, false, items[0].id, items[0].answer);
    assert.equal((await examData(db, u, again)).exam.correct_count, 0);
    const home = await prepHome(db, u, subject);
    assert.equal(home.topics[0].weak, true);
    for (const [rating, mins] of [
      ["Again", 1],
      ["Hard", 1440],
      ["Good", 5760],
    ] as const) {
      const card = (await prepHome(db, u, subject)).card;
      await rateCard(db, u, subject, card.id, rating);
      const r = (
        await db.query<{ mins: number }>(
          "SELECT round(extract(epoch from due_at-now())/60)::int mins FROM card_reviews WHERE user_id=$1 AND question_id=$2",
          [u.id, card.id],
        )
      ).rows[0];
      assert.equal(r.mins, mins);
      assert.notEqual((await prepHome(db, u, subject)).card?.id, card.id);
    }
  } finally {
    await pg.close();
  }
});
