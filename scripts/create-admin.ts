import { getDb } from "../src/server/db";
import { hashPassword } from "../src/server/auth";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
async function main() {
  loadEnvConfig(process.cwd());
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters). Stop the local server before using this script with PGlite.",
    );
  const db = await getDb();
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const result = await tx.query<{ id: string }>(
      `INSERT INTO users(id,email,password_hash,name,role,group_id) VALUES($1,$2,$3,'Administrator','admin','group-a') ON CONFLICT(email) DO UPDATE SET role='admin',password_hash=excluded.password_hash RETURNING id`,
      [id, email, passwordHash],
    );
    const accountId = result.rows[0].id;
    // Provisioning changes privileges/password: old sessions must not inherit them.
    await tx.query("DELETE FROM auth_sessions WHERE user_id=$1", [accountId]);
    await tx.query("DELETE FROM password_resets WHERE user_id=$1", [accountId]);
  });
  console.log("Administrator account is ready. Sign in at /sign-in.");
  process.exit(0);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
