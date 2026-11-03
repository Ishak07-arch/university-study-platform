import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "../src/server/db";
import { hashPassword } from "../src/server/auth";
async function main() {
  loadEnvConfig(process.cwd());
  const email = z
      .email()
      .safeParse(process.env.PROFESSOR_EMAIL?.trim().toLowerCase()),
    name = process.env.PROFESSOR_NAME?.trim(),
    password = process.env.PROFESSOR_PASSWORD;
  if (
    !email.success ||
    !name ||
    name.length > 60 ||
    !password ||
    password.length < 12 ||
    password.length > 128
  )
    throw Error(
      "Set PROFESSOR_EMAIL, PROFESSOR_NAME (up to 60 characters) and PROFESSOR_PASSWORD (12–128 characters).",
    );
  const id = randomUUID(),
    hash = await hashPassword(password),
    db = await getDb();
  await db.transaction(async (tx) => {
    const r = await tx.query(
      "INSERT INTO users(id,email,password_hash,name,role,group_id) VALUES($1,$2,$3,$4,'professor','group-a') ON CONFLICT(email) DO NOTHING RETURNING id",
      [id, email.data, hash, name],
    );
    if (!r.rows.length)
      throw Error(
        "That address is already registered. Use a dedicated staff account.",
      );
    await tx.query(
      "INSERT INTO audit_records(id,action,entity_id,detail) VALUES($1,'professor.provisioned',$2,$3)",
      [randomUUID(), id, JSON.stringify({ method: "operator CLI" })],
    );
  });
  console.log(
    "Professor account created. An administrator can now assign teaching access.",
  );
  process.exit(0);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
