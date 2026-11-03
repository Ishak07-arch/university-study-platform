import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/server/db";
import type { Profile } from "../src/lib/types";
import { readMigrations } from "../src/server/migrations";
import { seed } from "../src/server/seed";
import { approveEnrolment } from "../src/server/enrolment";
test("migration preserves existing memberships; only an administrator can assign a pending real student once", async () => {
  const pg = await PGlite.create(),
    db = pg as unknown as Db;
  try {
    const migrations = await readMigrations();
    for (const m of migrations.slice(0, -1)) await db.exec(m.sql);
    await seed(db);
    await db.exec(
      "INSERT INTO users(id,name,email,role,is_demo,group_id) VALUES ('verified','Student','existing@test.invalid','student',false,'group-a'),('demo','Demo','demo@test.invalid','student',true,'demo-group'),('admin','Admin','admin@test.invalid','admin',false,'group-a')",
    );
    await db.exec(migrations.at(-1)!.sql);
    await db.exec(
      "INSERT INTO users(id,name,email) VALUES('new','New student','new@test.invalid')",
    );
    const rows = async () =>
      (
        await db.query<{ id: string; group_id: string | null }>(
          "SELECT id,group_id FROM users ORDER BY id",
        )
      ).rows;
    assert.deepEqual(
      (await rows()).map((u) => u.group_id),
      ["group-a", "demo-group", null, "group-a"],
    );
    const admin = (
      await db.query<Profile>("SELECT * FROM users WHERE id='admin'")
    ).rows[0];
    for (const role of ["student", "professor"] as const)
      await assert.rejects(
        approveEnrolment(db, { ...admin, role }, "new@test.invalid", "group-a"),
        /administrators/,
      );
    for (const group of ["demo-group", "missing"])
      await assert.rejects(
        approveEnrolment(db, admin, "new@test.invalid", group),
        /pending/,
      );
    await approveEnrolment(db, admin, "new@test.invalid", "group-a");
    await assert.rejects(
      approveEnrolment(db, admin, "new@test.invalid", "group-a"),
      /pending/,
    );
    assert.equal(
      (await rows()).find((u) => u.id === "new")?.group_id,
      "group-a",
    );
    assert.deepEqual(
      (
        await db.query(
          "SELECT actor_id,entity_id,detail FROM audit_records WHERE action='enrolment.approved'",
        )
      ).rows,
      [{ actor_id: "admin", entity_id: "new", detail: { group: "group-a" } }],
    );
  } finally {
    await pg.close();
  }
});
