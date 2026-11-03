import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Db } from "./db";

export class MigrationError extends Error {}
export const migrationFiles = [
  "001-foundation.sql",
  "002-course-content.sql",
  "003-exercises.sql",
  "004-exam-prep.sql",
  "005-topic-progress.sql",
  "006-daily-study.sql",
] as const;
export interface Migration {
  name: string;
  sql: string;
  checksum: string;
}
export async function readMigrations(): Promise<Migration[]> {
  return Promise.all(
    migrationFiles.map(async (name) => {
      // Stable checksums across Windows/Linux checkouts without ignoring substantive edits.
      const sql = (
        await readFile(path.join(process.cwd(), "db", name), "utf8")
      ).replace(/\r\n/g, "\n");
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

// Called inside one transaction. A transaction-level lock serializes deploy jobs and
// releases automatically on failure/disconnection; no session-lock cleanup is needed.
export async function migrateHosted(db: Db, migrations: Migration[]) {
  return db.transaction(async (tx) => {
    await tx.exec(
      "SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'; SET LOCAL search_path=public;",
    );
    await tx.query("SELECT pg_advisory_xact_lock(174812, 1)");
    await tx.exec(`CREATE TABLE IF NOT EXISTS public.folio_schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    );`);
    const existing = (
      await tx.query<{ name: string; checksum: string }>(
        "SELECT name,checksum FROM public.folio_schema_migrations ORDER BY name",
      )
    ).rows;
    for (const [i, applied] of existing.entries()) {
      if (
        migrations[i]?.name !== applied.name ||
        migrations[i]?.checksum !== applied.checksum
      )
        throw new MigrationError(
          "Migration history differs from this checkout. Restore the applied files; add a new migration instead of editing history.",
        );
    }
    const applied: string[] = [];
    for (const migration of migrations.slice(existing.length)) {
      await tx.exec(migration.sql);
      await tx.query(
        "INSERT INTO public.folio_schema_migrations(name,checksum) VALUES($1,$2)",
        [migration.name, migration.checksum],
      );
      applied.push(migration.name);
    }
    return applied;
  });
}

export async function assertMigrated(db: Db, migrations: Migration[]) {
  if (
    !(
      await db.query<{ present: boolean }>(
        "SELECT to_regclass('public.folio_schema_migrations') IS NOT NULL AS present",
      )
    ).rows[0].present
  )
    throw new MigrationError("Run npm run db -- migrate before seeding.");
  const rows = (
    await db.query<{ name: string; checksum: string }>(
      "SELECT name,checksum FROM public.folio_schema_migrations ORDER BY name",
    )
  ).rows;
  if (
    rows.length !== migrations.length ||
    rows.some(
      (r, i) =>
        r.name !== migrations[i].name || r.checksum !== migrations[i].checksum,
    )
  )
    throw new MigrationError(
      "Run migrations from the matching checkout before seeding.",
    );
}
