import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { motivation } from "@/server/motivation";
import { contentError } from "@/server/http";
export async function GET() {
  try {
    return Response.json(await motivation(await getDb(), await requireUser()), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return contentError(e);
  }
}
