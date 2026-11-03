import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDb, type Db } from "./db";
import type { Profile } from "@/lib/types";
const scrypt = promisify(scryptCb);
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(value, salt, 64)) as Buffer;
  return salt + ":" + key.toString("hex");
}
export async function checkPassword(value: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const actual = (await scrypt(value, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export const profileFields =
  "u.id,u.name,u.email,u.role,u.group_id,g.name AS group_name,u.daily_goal,u.timezone,u.is_demo";
export async function currentUser(): Promise<Profile | null> {
  const token = (await cookies()).get("folio_session")?.value;
  if (!token) return null;
  const db = await getDb();
  return (
    (
      await db.query<Profile>(
        `SELECT ${profileFields} FROM users u LEFT JOIN class_groups g ON g.id=u.group_id JOIN auth_sessions a ON a.user_id=u.id WHERE a.token_hash=$1 AND a.expires_at>now()`,
        [digest(token)],
      )
    ).rows[0] || null
  );
}
export async function currentStudyPageUser() {
  const user = await currentUser();
  if (user && user.group_id === null) redirect("/enrolment");
  return user;
}
export async function createAuthSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const db = await getDb();
  await db.query(
    `INSERT INTO auth_sessions VALUES($1,$2,now()+interval '14 days')`,
    [digest(token), userId],
  );
  (await cookies()).set("folio_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_URL?.startsWith("https://") || false,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}
export async function signOut() {
  const c = await cookies();
  const token = c.get("folio_session")?.value;
  if (token)
    await (
      await getDb()
    ).query("DELETE FROM auth_sessions WHERE token_hash=$1", [digest(token)]);
  c.delete("folio_session");
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// Existing study endpoints use the learning workspace. Teaching accounts have explicit assignments instead.
export async function requireUser(workspace: "study" | "account" = "study") {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Please sign in to continue.");
  if (workspace === "study" && user.group_id === null)
    throw new HttpError(403, "Your class membership is awaiting approval.");
  if (workspace === "study" && user.role === "professor")
    throw new HttpError(403, "Use your assigned teaching workspace.");
  return user;
}
export function requireAdmin(user: Profile) {
  if (user.role !== "admin")
    throw new HttpError(403, "This area is available to administrators only.");
}
export async function rateLimit(key: string, max = 20) {
  const db = await getDb();
  const { rows } = await db.query<{ count: number }>(
    `INSERT INTO rate_limits(key,count,resets_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.resets_at<now() THEN 1 ELSE rate_limits.count+1 END, resets_at=CASE WHEN rate_limits.resets_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.resets_at END RETURNING count`,
    [digest(key)],
  );
  if (rows[0].count > max)
    throw new HttpError(
      429,
      "Too many requests. Please try again in 15 minutes.",
    );
}
export async function audit(
  tx: Db,
  actor: string | null,
  action: string,
  entity: string,
  detail: unknown = {},
) {
  await tx.query(
    "INSERT INTO audit_records(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), actor, action, entity, JSON.stringify(detail)],
  );
}
