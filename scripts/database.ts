import { loadEnvConfig } from "@next/env";
import {
  openHostedDatabase,
  DatabaseConfigError,
} from "../src/server/postgres";
import {
  readMigrations,
  migrateHosted,
  assertMigrated,
  MigrationError,
} from "../src/server/migrations";
import { seed } from "../src/server/seed";

async function main() {
  // Match Next's environment precedence; shell/deployment secrets take precedence over files.
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  const [command = "migrate", confirmation, ...extra] = process.argv.slice(2);
  if (
    !["migrate", "seed"].includes(command) ||
    extra.length ||
    (command === "migrate" && confirmation) ||
    (command === "seed" && confirmation !== "--confirm-demo-seed")
  )
    throw new DatabaseConfigError(
      "Usage: npm run db -- migrate | npm run db -- seed --confirm-demo-seed (optional sample curriculum)",
    );
  const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  if (!url)
    throw new DatabaseConfigError(
      "Set DATABASE_MIGRATION_URL or DATABASE_URL for this hosted-only command. Local PGlite initializes through npm run dev.",
    );
  const migrations = await readMigrations();
  const client = openHostedDatabase(url, {
    ...process.env,
    DATABASE_POOL_MAX: "1",
  });
  try {
    if (command === "migrate") {
      const applied = await migrateHosted(client.db, migrations);
      console.log(
        applied.length
          ? `Applied: ${applied.join(", ")}. No seed data was written.`
          : "Database migrations are up to date. No seed data was written.",
      );
    } else {
      await assertMigrated(client.db, migrations);
      await seed(client.db);
      console.log(
        "Optional sample curriculum seeded. No administrator credentials were created.",
      );
    }
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  // Driver errors can contain SQL, values or endpoints. Never print raw connection errors.
  console.error(
    error instanceof DatabaseConfigError || error instanceof MigrationError
      ? error.message
      : "Database command failed. Check connectivity, verified TLS, permissions and database logs. Migration changes were rolled back on failure.",
  );
  process.exitCode = 1;
});
