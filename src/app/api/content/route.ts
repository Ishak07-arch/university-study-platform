import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser, requireAdmin, rateLimit, HttpError } from "@/server/auth";
import {
  catalog,
  listResources,
  createChapter,
  createLesson,
  uploadResource,
  processResource,
  updateResource,
} from "@/server/content";
import { limitedBody, sameOrigin, contentError } from "@/server/http";
import { MAX_FILE_BYTES } from "@/server/ingestion";
export const runtime = "nodejs";
const id = z.string().min(1).max(100),
  title = z.string().trim().min(3).max(150);
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(),
      db = await getDb(),
      lessonId = req.nextUrl.searchParams.get("lesson");
    return NextResponse.json(
      lessonId
        ? { resources: await listResources(db, user, lessonId) }
        : await catalog(db, user),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return contentError(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const user = await requireUser();
    requireAdmin(user);
    await rateLimit("content:" + user.id, 60);
    const db = await getDb();
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const raw = await limitedBody(req, MAX_FILE_BYTES + 64000);
      const form = await new Response(raw, {
        headers: { "Content-Type": req.headers.get("content-type")! },
      }).formData();
      const input = z
        .object({
          lessonId: id,
          title,
          kind: z.enum(["PDF", "NOTE", "EXERCISE", "EXAM"]),
        })
        .parse(Object.fromEntries(form));
      const file = form.get("file");
      if (!(file instanceof File))
        throw new HttpError(400, "Choose a PDF or text file.");
      return NextResponse.json({
        id: await uploadResource(db, user, {
          ...input,
          filename: file.name,
          mime: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        }),
      });
    }
    const body = JSON.parse((await limitedBody(req, 20000)).toString());
    if (body.action === "chapter") {
      const d = z.object({ subjectId: id, title }).parse(body);
      return NextResponse.json({
        id: await createChapter(db, user, d.subjectId, d.title),
      });
    }
    if (body.action === "lesson") {
      const d = z
        .object({
          chapterId: id,
          title,
          body: z.string().trim().min(20).max(12000),
        })
        .parse(body);
      return NextResponse.json({
        id: await createLesson(db, user, d.chapterId, d.title, d.body),
      });
    }
    if (body.action === "process")
      return NextResponse.json(
        await processResource(db, user, id.parse(body.id)),
      );
    if (body.action === "update") {
      const d = z
        .object({
          id,
          title,
          lessonId: id,
          published: z.boolean(),
          archived: z.boolean(),
        })
        .parse(body);
      await updateResource(db, user, d);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown content action.");
  } catch (e) {
    return contentError(
      e instanceof z.ZodError || e instanceof SyntaxError
        ? new HttpError(400, "Check the required fields and try again.")
        : e,
    );
  }
}
