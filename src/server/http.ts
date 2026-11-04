import { NextRequest, NextResponse } from "next/server";
import { HttpError } from "./auth";
import { appOrigin } from "./config";
export function sameOrigin(req: NextRequest) {
  const expected = appOrigin(req.nextUrl.origin);
  if (req.headers.get("origin") !== expected)
    throw new HttpError(403, "Please reload the page and try again.");
}
export async function limitedBody(req: Request, max: number) {
  if (Number(req.headers.get("content-length")) > max)
    throw new HttpError(
      413,
      "This upload is too large. Maximum file size is 5 MB.",
    );
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "A request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new HttpError(413, "This request is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export function contentError(error: unknown) {
  const known = error instanceof HttpError;
  return NextResponse.json(
    {
      error: known ? error.message : "Something went wrong. Please try again.",
    },
    {
      status: known ? error.status : 500,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
