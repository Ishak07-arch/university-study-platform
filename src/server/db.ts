import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { seed } from "./seed";
import { dataDirectory } from "./config";

export interface Db {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
const globalDb = globalThis as unknown as { folioDb?: Promise<Db> };
function adaptPg(sql: ReturnType<typeof postgres>): Db {
  return {
    query: async <T>(q: string, p: unknown[] = []) => ({
      rows: (await sql.unsafe(q, p as never[])) as unknown as T[],
    }),
    exec: async (q) => sql.unsafe(q),
    transaction: async (fn) =>
      sql.begin((tx) =>
        fn(adaptPg(tx as unknown as ReturnType<typeof postgres>)),
      ) as never,
  };
}
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
        db = adaptPg(postgres(process.env.DATABASE_URL, { max: 5 }));
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
      return db;
    })();
  return globalDb.folioDb;
}
