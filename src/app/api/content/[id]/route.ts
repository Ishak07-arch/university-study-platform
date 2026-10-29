import { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { readResource } from "@/server/content";
import { contentError } from "@/server/http";
export const runtime = "nodejs";
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(),
      r = await readResource(await getDb(), user, (await params).id);
    return new Response(Buffer.from(r.bytes, "base64"), {
      headers: {
        "Content-Type": r.mime_type + "; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(r.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (e) {
    return contentError(e);
  }
}
