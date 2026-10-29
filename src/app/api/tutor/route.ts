import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, rateLimit, HttpError } from "@/server/auth";
import { getDb } from "@/server/db";
import { askTutor } from "@/server/tutor";
import { limitedBody, sameOrigin, contentError } from "@/server/http";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const user = await requireUser();
    await rateLimit("tutor:" + user.id, 15);
    await rateLimit("tutor:global", 300);
    const d = z
      .object({
        message: z.string().trim().min(3).max(1200),
        lessonId: z.string().max(100).optional(),
        sessionId: z.string().max(100).optional(),
      })
      .parse(JSON.parse((await limitedBody(req, 5000)).toString()));
    return NextResponse.json(
      await askTutor(await getDb(), user, d, d.message),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return contentError(
      e instanceof z.ZodError || e instanceof SyntaxError
        ? new HttpError(400, "Enter a question of 3–1200 characters.")
        : e,
    );
  }
}
