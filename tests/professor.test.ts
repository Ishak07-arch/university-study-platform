import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/server/db";
import type { Profile } from "../src/lib/types";
import { readMigrations } from "../src/server/migrations";
import { seed } from "../src/server/seed";
import { assignProfessor, scopes } from "../src/server/teaching";
import { classOverview, studentChallenges } from "../src/server/teaching-data";
import {
  createChallenge,
  participate,
  reviewSubmission,
  challengeInput,
} from "../src/server/challenges";
import { createReminder } from "../src/server/tasks";
import { answerQuestion } from "../src/server/learning";
import { requireAdmin } from "../src/server/auth";
test("teaching assignments isolate class tools, verified work and audited academic rewards", async () => {
  const pg = await PGlite.create(),
    db = pg as unknown as Db;
  try {
    for (const m of await readMigrations()) await db.exec(m.sql);
    await seed(db);
    await db.query(
      "INSERT INTO class_groups(id,name,semester_id) SELECT 'group-test','Other group',semester_id FROM class_groups WHERE id='group-a'",
    );
    const profile = (
      id: string,
      role: Profile["role"],
      group = "group-a",
    ): Profile => ({
      id,
      name: id,
      email: id + "@test.invalid",
      role,
      group_id: group,
      is_demo: false,
      timezone: "UTC",
      daily_goal: 30,
    });
    const admin = profile("admin", "admin"),
      prof = profile("prof", "professor"),
      peer = profile("peer", "professor"),
      student = profile("student", "student"),
      other = profile("outside", "student", "group-test");
    for (const u of [admin, prof, peer, student, other])
      await db.query(
        "INSERT INTO users(id,name,email,role,group_id) VALUES($1,$1,$2,$3,$4)",
        [u.id, u.email, u.role, u.group_id],
      );
    const group = student.group_id,
      subject = "statistics",
      deadline = new Date(Date.now() + 86400000).toISOString(),
      input = {
        group,
        subject,
        title: "Statistics challenge",
        instructions: "Solve this independently.",
        deadline,
        question: "statistics-1",
        xp: 10,
        academic: true,
      };
    await assert.rejects(scopes(db, student), /professors/);
    await assert.rejects(
      classOverview(db, student, group, subject),
      /professors/,
    );
    assert.throws(() => requireAdmin(prof));
    await assert.rejects(
      assignProfessor(db, prof, prof.id, group, subject, false),
      /administrators/,
    );
    assert.equal((await scopes(db, prof)).length, 0);
    for (const p of [prof, peer])
      await assignProfessor(db, admin, p.id, group, subject, false);
    await assert.rejects(
      createChallenge(db, prof, { ...input, group: "group-test" }),
      /assignment/,
    );
    await assert.rejects(
      createChallenge(db, prof, { ...input, subject: "accounting" }),
      /assignment/,
    );
    await assert.rejects(createChallenge(db, student, input), /professors/);
    assert.equal(
      challengeInput.safeParse({
        ...input,
        role: "admin",
        student_id: "outside",
      }).success,
      false,
    );
    await assert.rejects(createChallenge(db, prof, { ...input, xp: 999 }));
    await assert.rejects(
      createChallenge(db, prof, { ...input, question: "accounting-1" }),
      /exercise/,
    );
    const reminder = {
      subject_id: subject,
      group_id: group,
      title: "Read before class",
      description: "Bring notes",
      due_at: deadline,
      type: "ANNOUNCEMENT" as const,
      importance: 1,
    };
    await assert.rejects(
      createReminder(db, prof, { ...reminder, group_id: "group-test" }),
      /assignment/,
    );
    const task = await createReminder(db, prof, reminder);
    assert.equal(
      (
        await db.query("SELECT id FROM tasks WHERE id=$1 AND group_id=$2", [
          task,
          group,
        ])
      ).rows.length,
      1,
    );
    const id = await createChallenge(db, prof, input);
    assert.equal((await studentChallenges(db, other)).length, 0);
    assert.equal((await studentChallenges(db, student))[0].id, id);
    await assert.rejects(participate(db, other, id, ""), /unavailable/);
    await assert.rejects(participate(db, prof, id, ""), /unavailable/);
    const session = (await participate(db, student, id, ""))!;
    assert.equal(await participate(db, student, id, ""), session);
    await assert.rejects(answerQuestion(db, other, session, "statistics-1", 1));
    await answerQuestion(db, student, session, "statistics-1", 0);
    assert.equal((await studentChallenges(db, student))[0].status, null);
    const answer = await answerQuestion(
      db,
      student,
      session,
      "statistics-1",
      1,
    );
    assert.equal(answer.correct, true);
    assert.equal(
      (await answerQuestion(db, student, session, "statistics-1", 1)).xp,
      0,
    );
    assert.equal((await studentChallenges(db, student))[0].status, "verified");
    assert.equal(
      (
        await db.query(
          "SELECT id FROM xp_events WHERE event_key=$1 AND amount=10",
          ["verified-challenge:" + id],
        )
      ).rows.length,
      1,
    );
    const manual = await createChallenge(db, prof, {
      ...input,
      question: null,
    });
    await assert.rejects(
      reviewSubmission(db, prof, manual, student.id, true, ""),
      /pending/,
    );
    await participate(db, student, manual, "Here are my calculations.");
    await assert.rejects(
      reviewSubmission(db, peer, manual, student.id, true, ""),
      /author/,
    );
    await assert.rejects(
      reviewSubmission(db, student, manual, student.id, true, ""),
      /professors/,
    );
    await assert.rejects(
      reviewSubmission(db, prof, manual, other.id, true, ""),
      /unavailable/,
    );
    await assert.rejects(
      classOverview(db, prof, "group-test", subject),
      /assignment/,
    );
    assert.equal(
      (await classOverview(db, peer, group, subject)).queue.length,
      0,
    );
    assert.equal(
      (await classOverview(db, prof, group, subject)).queue.length,
      1,
    );
    await reviewSubmission(
      db,
      prof,
      manual,
      student.id,
      true,
      "Working checked.",
    );
    await assert.rejects(
      reviewSubmission(db, prof, manual, student.id, true, "Again"),
      /pending/,
    );
    const rows = (
      await db.query(
        "SELECT verification_method FROM academic_rewards WHERE user_id=$1 ORDER BY verification_method",
        [student.id],
      )
    ).rows;
    assert.deepEqual(rows, [
      { verification_method: "exercise" },
      { verification_method: "manual" },
    ]);
    const rejected = await createChallenge(db, prof, {
      ...input,
      question: null,
    });
    await participate(db, student, rejected, "My written answer.");
    await assignProfessor(db, admin, prof.id, group, subject, true);
    await assert.rejects(
      reviewSubmission(db, prof, rejected, student.id, true, ""),
      /assignment/,
    );
    await reviewSubmission(
      db,
      admin,
      rejected,
      student.id,
      false,
      "Missing calculation.",
    );
    assert.equal(
      (
        await db.query(
          "SELECT id FROM academic_rewards WHERE challenge_id=$1",
          [rejected],
        )
      ).rows.length,
      0,
    );
    const audits = (
      await db.query<{ action: string }>("SELECT action FROM audit_records")
    ).rows.map((r) => r.action);
    for (const event of [
      "assignment.granted",
      "assignment.revoked",
      "task.created",
      "challenge.created",
      "challenge.submitted",
      "challenge.auto_verified",
      "challenge.approved",
      "challenge.rejected",
    ])
      assert.ok(audits.includes(event), event);
  } finally {
    await pg.close();
  }
});
