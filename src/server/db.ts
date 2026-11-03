import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { seed } from "./seed";
import { dataDirectory } from "./config";
import { openHostedDatabase } from "./postgres";

export interface Db {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
const globalDb = globalThis as unknown as { folioDb?: Promise<Db> };
export function getDb(): Promise<Db> {
  if (!globalDb.folioDb)
    globalDb.folioDb = (async () => {
      let db: Db;
      if (process.env.DATABASE_URL) {
        if (
          process.env.NODE_ENV === "production" &&
          !process.env.APP_URL?.startsWith("https://")
        )
          throw new Error(
            "Set APP_URL to your public HTTPS origin for production.",
          );
        // Hosted runtime never performs DDL or seeds data, including development against a remote DB.
        return openHostedDatabase(process.env.DATABASE_URL).db;
      } else {
        if (
          process.env.NODE_ENV === "production" &&
          process.env.ENABLE_DEMO !== "true"
        )
          throw new Error(
            "Set DATABASE_URL for production or ENABLE_DEMO=true for a local preview.",
          );
        await mkdir(dataDirectory(), { recursive: true });
        db = (await PGlite.create(dataDirectory("folio"))) as unknown as Db;
      }
      // A production preview uses a local database already initialized by dev/qa:setup.
      if (process.env.NODE_ENV === "production") return db;
      await db.exec(
        await readFile(
          path.join(process.cwd(), "db", "001-foundation.sql"),
          "utf8",
        ),
      );
      await seed(db);
      await db.exec(
        await readFile(
          path.join(process.cwd(), "db", "002-course-content.sql"),
          "utf8",
        ),
      );
      await db.exec(
        await readFile(
          path.join(process.cwd(), "db", "003-exercises.sql"),
          "utf8",
        ),
      );
      await db.exec(
        await readFile(
          path.join(process.cwd(), "db", "004-exam-prep.sql"),
          "utf8",
        ),
      );
      await db.exec(
        await readFile(
          path.join(process.cwd(), "db", "005-topic-progress.sql"),
          "utf8",
        ),
      );
      await db.exec(
        await readFile(
          path.join(process.cwd(), "db", "006-daily-study.sql"),
          "utf8",
        ),
      );
      await db.exec(
        await readFile(
          path.join(process.cwd(), "db", "007-motivation.sql"),
          "utf8",
        ),
      );
      await db.exec(
        await readFile(
          path.join(process.cwd(), "db", "008-professor-challenges.sql"),
          "utf8",
        ),
      );
      await db.exec(
        await readFile(
          path.join(process.cwd(), "db", "009-pending-enrolment.sql"),
          "utf8",
        ),
      );
      return db;
    })();
  return globalDb.folioDb;
}
