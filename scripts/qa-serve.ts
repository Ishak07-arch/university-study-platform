import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const fixture = JSON.parse(await readFile(".data/qa-fixture.json", "utf8"));
  const production = process.argv.includes("--production");
  const tutorFixture = process.argv.includes("--tutor-fixture");
  const child = spawn(
    process.execPath,
    [
      path.resolve("node_modules/next/dist/bin/next"),
      production ? "start" : "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: "",
        FOLIO_DATA_DIR: fixture.root,
        APP_URL: "http://127.0.0.1:3000",
        ENABLE_DEMO: "true",
        SMTP_URL: "",
        OPENAI_API_KEY: tutorFixture ? "qa-only-not-a-real-key" : "",
        OPENAI_MODEL: tutorFixture ? "qa-fixture" : "",
        ...(tutorFixture
          ? {
              NODE_OPTIONS: `--import=${pathToFileURL(path.resolve("scripts/qa-tutor-provider.mjs")).href}`,
            }
          : {}),
      },
      windowsHide: true,
    },
  );
  child.on("exit", (code) => process.exit(code || 0));
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => child.kill(signal));
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
