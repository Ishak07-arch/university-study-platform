import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { contentError } from "@/server/http";
import { dailyStudy } from "@/server/study-plan";
export async function GET() {
  try {
    return Response.json(await dailyStudy(await getDb(), await requireUser()), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return contentError(e);
  }
}
