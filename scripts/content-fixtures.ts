// Tiny deterministic text PDF for ingestion tests; no third-party course content.
export function fixturePdf() {
  const texts = [
    "Statistics course notes. The mean is the sum of values divided by their count.",
    "Sample variance divides the sum of squared deviations by n minus one.",
  ];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
  ];
  for (let i = 0; i < 2; i++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents ${4 + i * 2} 0 R >>`,
    );
    const stream = `BT /F1 12 Tf 50 700 Td (${texts[i]}) Tj ET`;
    objects.push(
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let result = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(result));
    result += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xref = Buffer.byteLength(result);
  result +=
    `xref\n0 8\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result);
}
