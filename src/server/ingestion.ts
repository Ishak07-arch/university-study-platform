import { execFile } from "node:child_process";
import path from "node:path";
import { HttpError } from "./auth";
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export interface SourcePage {
  page: number | null;
  text: string;
}
export function validateFile(name: string, mime: string, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES)
    throw new HttpError(
      400,
      "Choose a non-empty PDF or UTF-8 text file up to 5 MB.",
    );
  const pdf = name.toLowerCase().endsWith(".pdf");
  if (
    pdf &&
    mime === "application/pdf" &&
    Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-"
  )
    return "application/pdf";
  if (name.toLowerCase().endsWith(".txt") && (!mime || mime === "text/plain")) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
        throw new Error();
    } catch {
      throw new HttpError(400, "Please upload readable UTF-8 text.");
    }
    return "text/plain";
  }
  throw new HttpError(
    400,
    "Only PDF (.pdf) and UTF-8 text (.txt) files are supported.",
  );
}
export async function extractPages(
  bytes: Uint8Array,
  mime: string,
): Promise<SourcePage[]> {
  if (mime === "text/plain")
    return [
      {
        page: null,
        text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      },
    ];
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [
        "--max-old-space-size=192",
        path.join(process.cwd(), "scripts", "extract-pdf.mjs"),
      ],
      {
        timeout: 20000,
        maxBuffer: 3 * 1024 * 1024,
        windowsHide: true,
        env: {
          SystemRoot: process.env.SystemRoot,
          PATH: process.env.PATH,
          NODE_ENV: "production",
        },
      },
      (err, out) => {
        if (err)
          return reject(
            new Error(
              "Could not extract this PDF. Use a text-based, unencrypted PDF of at most 150 pages, or upload a text version.",
            ),
          );
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(new Error("Could not read this PDF. Try a text version."));
        }
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(bytes);
  });
}
export function chunkPages(pages: SourcePage[]) {
  const chunks: SourcePage[] = [];
  if (pages.reduce((n, p) => n + p.text.length, 0) > 600000)
    throw new Error(
      "This resource contains too much text. Split it into smaller files.",
    );
  for (const page of pages) {
    const text = page.text
      .replace(/\u0000/g, "")
      .replace(/\s+/g, " ")
      .trim();
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 1400, text.length);
      if (end < text.length) {
        const space = text.lastIndexOf(" ", end);
        if (space > start + 800) end = space;
      }
      const content = text.slice(start, end).trim();
      if (content) chunks.push({ page: page.page, text: content });
      if (end === text.length) break;
      start = end - 180;
    }
  }
  if (!chunks.length || chunks.every((c) => c.text.length < 15))
    throw new Error(
      "No readable text was found. Scanned PDFs need OCR first; upload a text version.",
    );
  return chunks;
}
