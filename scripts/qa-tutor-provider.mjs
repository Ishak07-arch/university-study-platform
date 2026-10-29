// Explicit QA-only transport fixture, loaded by qa:serve -- --tutor-fixture.
// Never imported by application code. No external requests or real credentials.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const target =
    typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
  if (target !== "https://api.openai.com/v1/responses")
    return originalFetch(url, options);
  const request = JSON.parse(options.body);
  const input = JSON.parse(request.input);
  if (request.text?.format?.name === "practice_blueprint") {
    const source = input.sources.find((s) =>
      s.content.includes("Sample variance divides"),
    );
    const answer = {
      sourceId: source?.id || "",
      template: "variance",
      quote:
        "Sample variance divides the sum of squared deviations by n minus one.",
      answerText: "",
      type: "numeric",
    };
    return Response.json({
      status: "completed",
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(answer) }] },
      ],
    });
  }
  const source =
    input.sources.find((s) => s.text.includes("Sample variance")) ||
    input.sources[0];
  const answer = source
    ? {
        supported: true,
        paragraphs: [
          {
            text: "[QA fixture] Sample variance divides the sum of squared deviations by n minus one. This is a deterministic test response, not a live AI answer.",
            citations: [{ id: source.id, quote: source.text.slice(0, 800) }],
          },
        ],
      }
    : { supported: false, paragraphs: [] };
  return Response.json({
    status: "completed",
    output: [
      { content: [{ type: "output_text", text: JSON.stringify(answer) }] },
    ],
  });
};
