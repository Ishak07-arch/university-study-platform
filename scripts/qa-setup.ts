import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "../src/server/db";
import { hashPassword } from "../src/server/auth";

async function main() {
  process.env.DATABASE_URL = "";
  const root = path.resolve(".data", "qa-" + randomUUID());
  process.env.FOLIO_DATA_DIR = root;
  const db = await getDb();
  await db.query(
    `INSERT INTO class_groups VALUES('qa-group-b','semester-1','Economics · Group B')`,
  );
  const password = "QA-only-" + randomBytes(18).toString("base64url");
  const accounts = [
    {
      id: "qa-professor",
      email: "professor@folio-qa.invalid",
      name: "QA Professor",
      role: "professor",
      group: "group-a",
    },
    {
      id: "qa-admin",
      email: "admin@folio-qa.invalid",
      name: "QA Administrator",
      role: "admin",
      group: "group-a",
    },
    {
      id: "qa-student",
      email: "student@folio-qa.invalid",
      name: "Taylor Student",
      role: "student",
      group: "group-a",
    },
    {
      id: "qa-classmate",
      email: "classmate@folio-qa.invalid",
      name: "Casey Classmate",
      role: "student",
      group: "group-a",
    },
    {
      id: "qa-unrelated",
      email: "unrelated@folio-qa.invalid",
      name: "Jordan Otherclass",
      role: "student",
      group: "qa-group-b",
    },
  ];
  const hash = await hashPassword(password);
  for (const a of accounts)
    await db.query(
      "INSERT INTO users(id,email,name,role,group_id,password_hash) VALUES($1,$2,$3,$4,$5,$6)",
      [a.id, a.email, a.name, a.role, a.group, hash],
    );
  await mkdir(".data", { recursive: true });
  await writeFile(
    ".data/qa-fixture.json",
    JSON.stringify({ root, password, accounts }, null, 2),
  );
  console.log(
    "Created an isolated, seeded QA database. Development data is unchanged.",
  );
  console.log(
    "Start it with npm run qa:serve. Test-only credentials are in ignored .data/qa-fixture.json.",
  );
  process.exit(0);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
