import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { getDb } from "@/server/db";
import {
  currentUser,
  requireUser,
  requireAdmin,
  hashPassword,
  checkPassword,
  createAuthSession,
  signOut,
  digest,
  rateLimit,
  HttpError,
  audit,
} from "@/server/auth";
import { seedDemo } from "@/server/seed";
import { snapshot, sessionData } from "@/server/data";
import {
  startSession,
  answerQuestion,
  advanceSession,
} from "@/server/learning";
import type { Profile } from "@/lib/types";
import { completeReminder, createReminder } from "@/server/tasks";
import { dataDirectory } from "@/server/config";
import { availableQuestion } from "@/server/questions";
export const runtime = "nodejs";
const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const password = z.string().min(10, "Use at least 10 characters.").max(128);
const id = z.string().min(1).max(100);
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const sid = req.nextUrl.searchParams.get("session");
    if (sid) {
      const data = await sessionData(user, sid);
      if (!data) throw new HttpError(404, "Session not found.");
      return NextResponse.json(data);
    }
    return NextResponse.json(await snapshot(user));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    const expected = process.env.APP_URL
      ? new URL(process.env.APP_URL).origin
      : `${req.nextUrl.protocol}//${req.headers.get("host")}`;
    if (!origin || origin !== expected)
      throw new HttpError(
        403,
        "This request could not be verified. Reload the page and try again.",
      );
    if (Number(req.headers.get("content-length") || 0) > 20000)
      throw new HttpError(413, "This request is too large.");
    const raw = await req.text();
    if (raw.length > 20000)
      throw new HttpError(413, "This request is too large.");
    const body = JSON.parse(raw);
    const action = z.string().parse(body.action);
    const db = await getDb();
    if (["login", "register", "forgot", "reset", "demo"].includes(action))
      await rateLimit(
        "auth:" +
          action +
          ":" +
          (typeof body.email === "string"
            ? body.email.trim().toLowerCase()
            : "public"),
        action === "demo" ? 100 : 20,
      );
    if (action === "register") {
      const d = z
        .object({ name: z.string().trim().min(2).max(60), email, password })
        .parse(body);
      const existing = await db.query("SELECT id FROM users WHERE email=$1", [
        d.email,
      ]);
      if (existing.rows.length)
        throw new HttpError(
          409,
          "An account already exists for this email. Try signing in.",
        );
      const uid = randomUUID();
      await db.query(
        `INSERT INTO users(id,email,password_hash,name,group_id) VALUES($1,$2,$3,$4,'group-a')`,
        [uid, d.email, await hashPassword(d.password), d.name],
      );
      await createAuthSession(uid);
      return NextResponse.json({ ok: true });
    }
    if (action === "login") {
      const d = z.object({ email, password: z.string().max(128) }).parse(body);
      const user = (
        await db.query<Profile & { password_hash: string }>(
          "SELECT * FROM users WHERE email=$1 AND is_demo=false",
          [d.email],
        )
      ).rows[0];
      const valid = await checkPassword(
        d.password,
        user?.password_hash ||
          "00000000000000000000000000000000:" + "0".repeat(128),
      );
      if (!user || !valid)
        throw new HttpError(
          401,
          "Email or password is incorrect. Please try again.",
        );
      await createAuthSession(user.id);
      return NextResponse.json({
        ok: true,
        admin: user.role === "admin",
        professor: user.role === "professor",
      });
    }
    if (action === "demo") {
      if (
        process.env.NODE_ENV === "production" &&
        process.env.ENABLE_DEMO !== "true"
      )
        throw new HttpError(
          403,
          "Demo access is disabled. Please create an account.",
        );
      const existing = await currentUser();
      if (!existing) {
        const uid = randomUUID();
        await db.query(
          `INSERT INTO users(id,email,name,group_id,is_demo,daily_goal) VALUES($1,$2,'Alex Johnson','demo-group',true,40)`,
          [uid, uid + "@demo.invalid"],
        );
        await seedDemo(db, uid);
        await createAuthSession(uid);
      }
      return NextResponse.json({ ok: true });
    }
    if (action === "forgot") {
      const d = z.object({ email }).parse(body);
      if (process.env.NODE_ENV === "production" && !process.env.SMTP_URL)
        throw new HttpError(
          503,
          "Password reset is temporarily unavailable. Please contact your university administrator.",
        );
      const user = (
        await db.query<{ id: string }>(
          "SELECT id FROM users WHERE email=$1 AND is_demo=false",
          [d.email],
        )
      ).rows[0];
      if (user) {
        const token = randomBytes(32).toString("hex");
        await db.query(
          `INSERT INTO password_resets VALUES($1,$2,now()+interval '30 minutes',NULL)`,
          [digest(token), user.id],
        );
        const link = expected + "/reset-password?token=" + token;
        const message = {
          from: process.env.MAIL_FROM || "Folio <hello@localhost>",
          to: d.email,
          subject: "Reset your Folio password",
          text:
            "Reset your password within 30 minutes: " +
            link +
            "\nIf you did not request this, you can ignore this email.",
        };
        try {
          if (process.env.SMTP_URL) {
            const nodemailer = await import("nodemailer");
            await nodemailer.default
              .createTransport(process.env.SMTP_URL)
              .sendMail(message);
          } else if (process.env.NODE_ENV !== "production") {
            await mkdir(dataDirectory("mail"), {
              recursive: true,
            });
            await writeFile(
              dataDirectory("mail", randomUUID() + ".json"),
              JSON.stringify(message, null, 2),
            );
          }
        } catch {
          await db.query("DELETE FROM password_resets WHERE token_hash=$1", [
            digest(token),
          ]);
          throw new HttpError(
            503,
            "We couldn’t send the reset email. Please try again later or contact your university administrator.",
          );
        }
      }
      return NextResponse.json({
        ok: true,
        message:
          "If an account exists, a reset link will be sent to your email.",
      });
    }
    if (action === "reset") {
      const d = z
        .object({ token: z.string().length(64), password })
        .parse(body);
      const hash = await hashPassword(d.password);
      await db.transaction(async (tx) => {
        const r = (
          await tx.query<{ user_id: string }>(
            "SELECT user_id FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE",
            [digest(d.token)],
          )
        ).rows[0];
        if (!r)
          throw new HttpError(
            400,
            "This reset link has expired or was already used. Request a new one.",
          );
        await tx.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
          hash,
          r.user_id,
        ]);
        await tx.query(
          "UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
          [r.user_id],
        );
        await tx.query("DELETE FROM auth_sessions WHERE user_id=$1", [
          r.user_id,
        ]);
      });
      return NextResponse.json({ ok: true });
    }
    const user = await requireUser(action === "logout" ? "account" : "study");
    await rateLimit("user:" + user.id, 500);
    if (action === "logout") {
      await signOut();
      return NextResponse.json({ ok: true });
    }
    if (action === "profile") {
      const d = z
        .object({
          name: z.string().trim().min(2).max(60),
          daily_goal: z.number().int().min(10).max(200),
          timezone: z.string().max(60),
        })
        .parse(body);
      try {
        new Intl.DateTimeFormat("en", { timeZone: d.timezone });
      } catch {
        throw new HttpError(400, "Choose a valid timezone.");
      }
      await db.query(
        "UPDATE users SET name=$1,daily_goal=$2,timezone=$3 WHERE id=$4",
        [d.name, d.daily_goal, d.timezone, user.id],
      );
      return NextResponse.json({ ok: true });
    }
    if (action === "start") {
      const d = z
        .object({
          subject: id,
          mode: z.enum(["practice", "review", "exam"]),
          lesson: id.optional(),
          minutes: z
            .union([z.literal(5), z.literal(10), z.literal(20)])
            .optional(),
        })
        .parse(body);
      return NextResponse.json({
        id: await startSession(
          db,
          user,
          d.subject,
          d.mode,
          d.minutes,
          d.lesson,
        ),
      });
    }
    if (action === "answer") {
      const d = z
        .object({
          session: id,
          question: id,
          selected: z.union([z.number().int(), z.string().max(500)]),
        })
        .parse(body);
      return NextResponse.json(
        await answerQuestion(db, user, d.session, d.question, d.selected),
      );
    }
    if (action === "next")
      return NextResponse.json(
        await advanceSession(db, user, id.parse(body.session)),
      );
    if (action === "explain") {
      const d = z.object({ session: id, question: id }).parse(body);
      if (!(await availableQuestion(db, user, d.question)))
        throw new HttpError(404, "This exercise is no longer available.");
      const r = (
        await db.query<{ explanation: string }>(
          `SELECT q.explanation FROM questions q JOIN question_attempts a ON a.question_id=q.id JOIN study_sessions s ON s.id=a.session_id WHERE s.user_id=$1 AND s.id=$2 AND q.id=$3 LIMIT 1`,
          [user.id, d.session, d.question],
        )
      ).rows[0];
      if (!r) throw new HttpError(403, "Try an answer first.");
      return NextResponse.json(r);
    }
    if (action === "task") {
      const d = z.object({ id, completed: z.boolean() }).parse(body);
      await completeReminder(db, user, d.id, d.completed);
      return NextResponse.json({ ok: true });
    }
    requireAdmin(user);
    if (action === "admin-task") {
      const d = z
        .object({
          subject_id: id,
          group_id: id,
          title: z.string().trim().min(3).max(120),
          description: z.string().max(2000),
          type: z.enum([
            "HOMEWORK",
            "PRINT",
            "BRING",
            "EXAM",
            "QUIZ",
            "ANNOUNCEMENT",
            "CLASS_PREPARATION",
          ]),
          due_at: z.iso.datetime(),
          importance: z.number().int().min(1).max(3),
        })
        .parse(body);
      await createReminder(db, user, d);
      return NextResponse.json({ ok: true });
    }
    if (action === "admin-subject") {
      const d = z
        .object({
          name: z.string().trim().min(2).max(100),
          code: z.string().trim().min(2).max(20),
          description: z.string().min(3).max(500),
          semester_id: id,
        })
        .parse(body);
      const sid = randomUUID();
      await db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO subjects(id,semester_id,name,code,description) VALUES($1,$2,$3,$4,$5)",
          [sid, d.semester_id, d.name, d.code, d.description],
        );
        await audit(tx, user.id, "subject.created", sid, d);
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "admin-lesson") {
      const d = z
        .object({
          subject_id: id,
          title: z.string().trim().min(3).max(150),
          chapter: z.string().trim().min(3).max(150),
          body: z.string().trim().min(20).max(12000),
        })
        .parse(body);
      const lid = randomUUID(),
        cid = randomUUID();
      await db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO chapters(id,subject_id,title) VALUES($1,$2,$3)",
          [cid, d.subject_id, d.chapter],
        );
        await tx.query(
          "INSERT INTO lessons(id,chapter_id,title,body) VALUES($1,$2,$3,$4)",
          [lid, cid, d.title, d.body],
        );
        await audit(tx, user.id, "lesson.created", lid, {
          subject_id: d.subject_id,
        });
      });
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  if (e instanceof z.ZodError)
    return NextResponse.json(
      { error: e.issues[0]?.message || "Please check the form." },
      { status: 400 },
    );
  if (e instanceof HttpError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof SyntaxError)
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  console.error(
    "Request failed:",
    e instanceof Error ? e.message : "Unknown error",
  );
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
