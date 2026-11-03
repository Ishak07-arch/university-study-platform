import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { mkdir, mkdtemp, rm } from "node:fs/promises";

import path from "node:path";
const testEnv = process.env as Record<string, string | undefined>;
import { getDb, type Db } from "../src/server/db";
import { seed } from "../src/server/seed";
import { hostedOptions } from "../src/server/postgres";
import {
  migrateHosted,
  readMigrations,
  assertMigrated,
} from "../src/server/migrations";

test("ordered hosted migrations run without seeding and are repeatable with a checksum ledger", async () => {
  const pg = await PGlite.create(),
    db = pg as unknown as Db;
  try {
    const migrations = await readMigrations();
    assert.deepEqual(await migrateHosted(db, migrations), [
      "001-foundation.sql",
      "002-course-content.sql",
      "003-exercises.sql",
      "004-exam-prep.sql",
      "005-topic-progress.sql",
      "006-daily-study.sql",
      "007-motivation.sql",
      "008-professor-challenges.sql",
    ]);
    await assertMigrated(db, migrations);
    assert.equal(
      (await db.query<{ n: number }>("SELECT count(*)::int n FROM subjects"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (await db.query<{ n: number }>("SELECT count(*)::int n FROM users"))
        .rows[0].n,
      0,
    );
    assert.deepEqual(await migrateHosted(db, migrations), []);
    await seed(db);
    await db.query(
      "INSERT INTO users(id,email,name,group_id) VALUES('preserved','preserved@test.invalid','Preserved','group-a')",
    );
    // Audit the raw SQL's idempotency as well as the ledger's skip behaviour.
    for (const migration of migrations) await db.exec(migration.sql);
    await seed(db);
    assert.equal(
      (
        await db.query<{ name: string }>(
          "SELECT name FROM users WHERE id='preserved'",
        )
      ).rows[0].name,
      "Preserved",
    );
    const indexes = (
      await db.query<{ indexname: string }>(
        "SELECT indexname FROM pg_indexes WHERE schemaname='public'",
      )
    ).rows.map((r) => r.indexname);
    for (const name of [
      "attempts_user_question",
      "xp_user_date",
      "resource_chunks_search",
      "resources_lesson_published",
      "question_fingerprint",
      "questions_lesson_enabled",
      "mistakes_student_recent",
    ])
      assert.ok(indexes.includes(name), name);
    await assert.rejects(
      db.query(
        "INSERT INTO chapters(id,subject_id,title) VALUES('bad','missing','Bad')",
      ),
    );
    await assert.rejects(
      db.query("UPDATE questions SET difficulty=9 WHERE id='statistics-1'"),
    );
    await assert.rejects(
      db.query(
        "UPDATE questions SET question_type='essay' WHERE id='statistics-1'",
      ),
    );
    await db.query(
      "UPDATE questions SET fingerprint='duplicate-test' WHERE id='statistics-1'",
    );
    await assert.rejects(
      db.query(
        "UPDATE questions SET fingerprint='duplicate-test' WHERE id='statistics-2'",
      ),
    );
    const altered = migrations.map((m, i) =>
      i === 1 ? { ...m, checksum: "changed" } : m,
    );
    await assert.rejects(migrateHosted(db, altered), /history differs/);
    await assert.rejects(
      migrateHosted(db, migrations.slice(0, 2)),
      /history differs/,
    );
    await db.query(
      "DELETE FROM folio_schema_migrations WHERE name='002-course-content.sql'",
    );
    await assert.rejects(migrateHosted(db, migrations), /history differs/);
  } finally {
    await pg.close();
  }
});

test("migration failure rolls back DDL and ledger; existing auto-initialized databases can be baselined", async () => {
  const pg = await PGlite.create(),
    db = pg as unknown as Db;
  try {
    const migrations = await readMigrations();
    await assert.rejects(assertMigrated(db, migrations), /before seeding/);
    await assert.rejects(
      migrateHosted(db, [
        ...migrations,
        {
          name: "004-failure.sql",
          checksum: "failure",
          sql: "CREATE TABLE rollback_probe(id int); SELECT * FROM missing_table;",
        },
      ]),
    );
    assert.equal(
      (
        await db.query<{ exists: boolean }>(
          "SELECT to_regclass('public.universities') IS NOT NULL AS exists",
        )
      ).rows[0].exists,
      false,
    );
    assert.equal(
      (
        await db.query<{ exists: boolean }>(
          "SELECT to_regclass('public.folio_schema_migrations') IS NOT NULL AS exists",
        )
      ).rows[0].exists,
      false,
    );
    // Preserve the old local order: foundation -> seed -> content -> exercises.
    await db.exec(migrations[0].sql);
    await seed(db);
    await db.exec(migrations[1].sql);
    await db.exec(migrations[2].sql);
    await db.query(
      "UPDATE subjects SET description='Existing custom data' WHERE id='statistics'",
    );
    await migrateHosted(db, migrations);
    assert.equal(
      (
        await db.query<{ description: string }>(
          "SELECT description FROM subjects WHERE id='statistics'",
        )
      ).rows[0].description,
      "Existing custom data",
    );
  } finally {
    await pg.close();
  }
});

test("hosted configuration verifies TLS, bounds connection pools and rejects unsafe transaction endpoints", () => {
  const uri =
    "postgresql://user:private-test-password@db.example.com:5432/postgres";
  const options = hostedOptions(uri, {});
  assert.equal(options.max, 1);
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(options.prepare, false);
  assert.equal(options.connect_timeout, 10);
  assert.equal(options.idle_timeout, 20);
  assert.equal(
    hostedOptions(uri, {
      DATABASE_CONNECTION_MODE: "direct",
      DATABASE_POOL_MAX: "5",
    }).max,
    5,
  );
  const ca = "-----BEGIN CERTIFICATE-----\\ntest\\n-----END CERTIFICATE-----";
  assert.deepEqual(hostedOptions(uri, { DATABASE_SSL_CA: ca }).ssl, {
    rejectUnauthorized: true,
    ca: ca.replace(/\\n/g, "\n"),
  });
  assert.equal(
    hostedOptions("postgres://user:password@localhost:5432/local", {
      DATABASE_SSL: "disable",
      NODE_ENV: "development",
    }).ssl,
    false,
  );
  for (const env of [
    { DATABASE_CONNECTION_MODE: "transaction" },
    { DATABASE_POOL_MAX: "0" },
    { DATABASE_POOL_MAX: "1.5" },
    { DATABASE_POOL_MAX: "100" },
    { DATABASE_SSL: "require" },
    { DATABASE_SSL: "disable" },
    { DATABASE_SSL_CA: "C:/cert.pem" },
  ])
    assert.throws(() => hostedOptions(uri, env));
  assert.throws(() =>
    hostedOptions("postgres://user:password@localhost:5432/local", {
      DATABASE_SSL: "disable",
      NODE_ENV: "production",
    }),
  );
  assert.throws(
    () =>
      hostedOptions(
        "postgres://user:password@aws-0-region.pooler.supabase.com:6543/postgres",
        {},
      ),
    /5432/,
  );
  assert.throws(
    () =>
      hostedOptions(
        "postgres://user:password@db.project.supabase.co:6543/postgres",
        {},
      ),
    /5432/,
  );
  for (const query of [
    "sslmode=disable",
    "max_pipeline=0",
    "options=-csearch_path%3Devil",
    "sslrootcert=/tmp/cert",
  ])
    assert.throws(() => hostedOptions(uri + "?" + query, {}));
  assert.equal(hostedOptions(uri + "?sslmode=verify-full", {}).max, 1);
  assert.throws(
    () => hostedOptions("not-a-uri", {}),
    (e) => e instanceof Error && !e.message.includes("private-test-password"),
  );
});

test("hosted getDb returns a lazy connection without DDL or seeds", async () => {
  const previous = {
    url: testEnv.DATABASE_URL,
    mode: testEnv.NODE_ENV,
    origin: testEnv.APP_URL,
  };
  testEnv.DATABASE_URL =
    "postgresql://user:test-only@127.0.0.1:1/never-connect";
  testEnv.NODE_ENV = "production";
  testEnv.APP_URL = "https://test.invalid";
  try {
    // No server exists here. Any startup migration/seed query would fail this test.
    const db = await getDb();
    assert.equal(typeof db.transaction, "function");
    assert.equal(await getDb(), db);
  } finally {
    for (const [key, value] of Object.entries({
      DATABASE_URL: previous.url,
      NODE_ENV: previous.mode,
      APP_URL: previous.origin,
    })) {
      if (value === undefined) delete testEnv[key];
      else testEnv[key] = value;
    }
    delete (globalThis as unknown as { folioDb?: Promise<Db> }).folioDb;
  }
});

test("PGlite development still initializes automatically; production preview never seeds", async () => {
  await mkdir(path.join(process.cwd(), ".data"), { recursive: true });
  const root = await mkdtemp(path.join(process.cwd(), ".data", "db-prep-"));
  const keys = [
    "DATABASE_URL",
    "NODE_ENV",
    "ENABLE_DEMO",
    "FOLIO_DATA_DIR",
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, testEnv[key]]));
  let db: Db | undefined;
  const reset = () => {
    delete (globalThis as unknown as { folioDb?: Promise<Db> }).folioDb;
  };
  try {
    testEnv.DATABASE_URL = "";
    testEnv.ENABLE_DEMO = "true";
    testEnv.FOLIO_DATA_DIR = root;
    testEnv.NODE_ENV = "production";
    reset();
    db = await getDb();
    assert.equal(
      (
        await db.query<{ exists: boolean }>(
          "SELECT to_regclass('public.subjects') IS NOT NULL AS exists",
        )
      ).rows[0].exists,
      false,
    );
    await (db as unknown as PGlite).close();
    db = undefined;
    reset();
    testEnv.NODE_ENV = "development";
    db = await getDb();
    assert.equal(
      (await db.query<{ n: number }>("SELECT count(*)::int n FROM subjects"))
        .rows[0].n,
      5,
    );
    await db.query("SELECT question_type FROM questions LIMIT 1");
    await (db as unknown as PGlite).close();
    db = undefined;
    reset();
    testEnv.NODE_ENV = "production";
    db = await getDb();
    assert.equal(
      (await db.query<{ n: number }>("SELECT count(*)::int n FROM subjects"))
        .rows[0].n,
      5,
    );
  } finally {
    if (db) await (db as unknown as PGlite).close();
    reset();
    for (const key of keys) {
      if (previous[key] === undefined) delete testEnv[key];
      else testEnv[key] = previous[key];
    }
    await rm(root, { recursive: true, force: true });
  }
});
