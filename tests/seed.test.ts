import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/server/db";
import { readMigrations, migrateHosted } from "../src/server/migrations";
import { seed } from "../src/server/seed";

const count = async (db: Db, group: string) =>
  (
    await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM tasks WHERE group_id=$1",
      [group],
    )
  ).rows[0].n;

test("sample reminders are never added to group-a once real students belong to it", async () => {
  const pg = await PGlite.create(),
    db = pg as unknown as Db;
  try {
    await migrateHosted(db, await readMigrations());
    await seed(db);
    const sample = await count(db, "group-a");
    assert.ok(sample > 0);
    assert.equal(await count(db, "demo-group"), sample);

    // A live class: remove the sample reminders, as an administrator would.
    await db.exec(
      "INSERT INTO users(id,email,name,group_id) VALUES('s1','s1@test.invalid','Student','group-a'); DELETE FROM task_completions; DELETE FROM tasks WHERE group_id='group-a';",
    );
    await seed(db);
    assert.equal(await count(db, "group-a"), 0);
    assert.equal(await count(db, "demo-group"), sample);
  } finally {
    await pg.close();
  }
});

test("demo accounts and staff do not make group-a a live class", async () => {
  const pg = await PGlite.create(),
    db = pg as unknown as Db;
  try {
    await migrateHosted(db, await readMigrations());
    await db.exec(
      "INSERT INTO universities VALUES('u','U'); INSERT INTO faculties VALUES('f','u','F'); INSERT INTO academic_years VALUES('y','f','Y'); INSERT INTO semesters VALUES('semester-1','y','S'); INSERT INTO class_groups VALUES('group-a','semester-1','A'); INSERT INTO users(id,email,name,role,group_id) VALUES('a','a@test.invalid','Admin','admin','group-a'),('p','p@test.invalid','Prof','professor','group-a');",
    );
    await seed(db);
    assert.ok((await count(db, "group-a")) > 0);
  } finally {
    await pg.close();
  }
});
