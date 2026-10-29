import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser, requireAdmin, rateLimit, HttpError } from "@/server/auth";
import { sameOrigin, limitedBody, contentError } from "@/server/http";
import { saveManualQuestion, disableQuestion } from "@/server/questions";
import { preparePractice } from "@/server/exercise-sessions";
export const runtime = "nodejs";
const id = z.string().min(1).max(100);
const json = (value: unknown) =>
  NextResponse.json(value, {
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    requireAdmin(user);
    const lesson = id.parse(req.nextUrl.searchParams.get("lesson"));
    const db = await getDb();
    return json({
      questions: (
        await db.query(
          `SELECT q.*,r.id resource_id FROM questions q LEFT JOIN resource_chunks rc ON rc.id=q.source_chunk_id LEFT JOIN resources r ON r.id=rc.resource_id WHERE q.lesson_id=$1 ORDER BY q.created_at DESC,q.id LIMIT 100`,
          [lesson],
        )
      ).rows,
    });
  } catch (e) {
    return error(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const user = await requireUser();
    const db = await getDb();
    const body = JSON.parse((await limitedBody(req, 15000)).toString("utf8"));
    if (body.action === "save" || body.action === "disable") {
      requireAdmin(user);
      await rateLimit("question-admin:" + user.id, 60);
      if (body.action === "disable") {
        await disableQuestion(db, user, id.parse(body.id));
        return json({ ok: true });
      }
      return json({ id: await saveManualQuestion(db, user, body.question) });
    }
    const d = z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("practice"), lessonId: id }),
        z.object({ action: z.literal("similar"), sessionId: id }),
      ])
      .parse(body);
    if (user.is_demo)
      throw new HttpError(
        403,
        "Sign in with a student account to practise course materials.",
      );
    await rateLimit("exercise:" + user.id, 15);
    await rateLimit("exercise:global", 300);
    return json(await preparePractice(db, user, d));
  } catch (e) {
    return error(e);
  }
}
function error(e: unknown) {
  return contentError(
    e instanceof z.ZodError
      ? new HttpError(400, e.issues[0]?.message || "Please check the question.")
      : e instanceof SyntaxError
        ? new HttpError(400, "Invalid request.")
        : e,
  );
}
