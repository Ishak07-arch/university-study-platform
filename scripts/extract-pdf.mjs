// Separate process: bounded heap, lifetime and output. Never run document scripts.
import { PDFParse } from "pdf-parse";
const parts = [];
for await (const part of process.stdin) parts.push(part);
const parser = new PDFParse({
  data: new Uint8Array(Buffer.concat(parts)),
  isEvalSupported: false,
  useSystemFonts: false,
});
try {
  const info = await parser.getInfo();
  if (info.total > 150) throw new Error("page limit");
  const result = await parser.getText({ pageJoiner: "" });
  const pages = result.pages.map((p) => ({ page: p.num, text: p.text }));
  if (pages.reduce((n, p) => n + p.text.length, 0) > 600000)
    throw new Error("text limit");
  process.stdout.write(JSON.stringify(pages));
} catch {
  process.exitCode = 1;
} finally {
  await parser.destroy();
}
