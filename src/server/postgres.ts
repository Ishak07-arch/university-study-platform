import postgres from "postgres";
import type { Db } from "./db";

export class DatabaseConfigError extends Error {}

// Server/CLI only. The URI chooses the endpoint; the mode is a guard, not a URI rewrite.
export function hostedOptions(
  url: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DatabaseConfigError("Set a valid PostgreSQL connection URI.");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.username ||
    parsed.pathname.length < 2
  )
    throw new DatabaseConfigError(
      "Set a PostgreSQL URI with a host, user and database name.",
    );
  const mode = env.DATABASE_CONNECTION_MODE || "session";
  if (!["session", "direct"].includes(mode))
    throw new DatabaseConfigError(
      "DATABASE_CONNECTION_MODE must be session or direct. Transaction pooling is not supported with this sql.begin() implementation.",
    );
  if (
    parsed.port === "6543" &&
    /\.(supabase\.co|pooler\.supabase\.com)$/.test(parsed.hostname)
  )
    throw new DatabaseConfigError(
      "Use the Supabase session or direct endpoint on port 5432, not the transaction pooler on 6543.",
    );
  // Do not let URI query parameters override driver/startup safety settings.
  for (const key of parsed.searchParams.keys())
    if (key !== "sslmode" || parsed.searchParams.get(key) !== "verify-full")
      throw new DatabaseConfigError(
        "Only sslmode=verify-full is supported in the URI. Configure connection options with the documented DATABASE_* variables.",
      );
  const max = Number(env.DATABASE_POOL_MAX || 1);
  if (!Number.isInteger(max) || max < 1 || max > 10)
    throw new DatabaseConfigError(
      "DATABASE_POOL_MAX must be an integer from 1 to 10.",
    );
  const sslMode = env.DATABASE_SSL || "verify-full";
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    parsed.hostname,
  );
  if (
    sslMode !== "verify-full" &&
    !(sslMode === "disable" && loopback && env.NODE_ENV !== "production")
  )
    throw new DatabaseConfigError(
      "DATABASE_SSL must be verify-full. disable is allowed only for local PostgreSQL outside production.",
    );
  const ca = env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  if (ca && !ca.includes("-----BEGIN CERTIFICATE-----"))
    throw new DatabaseConfigError(
      "DATABASE_SSL_CA must contain a PEM certificate, not a file path.",
    );
  return {
    max,
    ssl:
      sslMode === "disable"
        ? false
        : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 300,
    // Retain the driver's working sql.begin() semantics; do not set max_pipeline:0.
    debug: false,
    onnotice: () => {},
    connection: {
      application_name: "folio",
      search_path: "public",
      statement_timeout: 30000,
    },
  } satisfies postgres.Options<{}>;
}

export function adaptPg(sql: ReturnType<typeof postgres>): Db {
  return {
    query: async <T>(q: string, p: unknown[] = []) => ({
      rows: (await sql.unsafe(q, p as never[])) as unknown as T[],
    }),
    // SQL migration/seed files contain multiple statements: use the simple protocol explicitly.
    exec: async (q) => sql.unsafe(q).simple(),
    transaction: async (fn) =>
      sql.begin((tx) =>
        fn(adaptPg(tx as unknown as ReturnType<typeof postgres>)),
      ) as never,
  };
}

export function openHostedDatabase(
  url: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const sql = postgres(url, hostedOptions(url, env));
  return { db: adaptPg(sql), close: () => sql.end({ timeout: 5 }) };
}
