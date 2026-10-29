import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/server/db";
import type { Profile } from "../src/lib/types";
import { seed } from "../src/server/seed";
import {
  createChapter,
  createLesson,
  uploadResource,
  processResource,
  updateResource,
  listResources,
  readResource,
} from "../src/server/content";
import {
  askTutor,
  openAIProvider,
  retrieve,
  tutorContext,
} from "../src/server/tutor";
import {
  validateFile,
  chunkPages,
  MAX_FILE_BYTES,
} from "../src/server/ingestion";
import { startSession, answerQuestion } from "../src/server/learning";
import { fixturePdf } from "../scripts/content-fixtures";
let pg: PGlite, db: Db, lessonId: string, resourceId: string;
const student: Profile = {
  id: "content-student",
  email: "content@example.invalid",
  name: "Student",
  role: "student",
  group_id: "group-a",
  daily_goal: 30,
  timezone: "Africa/Lagos",
  is_demo: false,
};
const admin: Profile = { ...student, id: "content-admin", role: "admin" };
before(async () => {
  pg = await PGlite.create();
  db = pg as unknown as Db;
  await db.exec(await readFile("db/001-foundation.sql", "utf8"));
  await seed(db);
  await db.exec(await readFile("db/003-exercises.sql", "utf8"));
  await db.exec(await readFile("db/002-course-content.sql", "utf8"));
  await db.exec(await readFile("db/002-course-content.sql", "utf8"));
  for (const u of [student, admin])
    await db.query(
      "INSERT INTO users(id,email,name,role,group_id) VALUES($1,$2,$3,$4,$5)",
      [u.id, u.id + "@example.invalid", u.name, u.role, u.group_id],
    );
});
after(async () => {
  await pg.close();
});
test("admin creates chapter, lesson, PDF draft, extracts pages, then publishes", async () => {
  const chapter = await createChapter(
    db,
    admin,
    "statistics",
    "Chapter 2 — Averages",
  );
  lessonId = await createLesson(
    db,
    admin,
    chapter,
    "Mean and sample variance",
    "Read the course material and practise calculating averages.",
  );
  resourceId = await uploadResource(db, admin, {
    lessonId,
    title: "Statistics lecture",
    kind: "PDF",
    filename: "stats.pdf",
    mime: "application/pdf",
    bytes: fixturePdf(),
  });
  assert.equal((await listResources(db, student, lessonId)).length, 0);
  await assert.rejects(readResource(db, student, resourceId), /not found/);
  await assert.rejects(
    updateResource(db, admin, {
      id: resourceId,
      title: "Statistics lecture",
      lessonId,
      published: true,
      archived: false,
    }),
    /Extract/,
  );
  const result = await processResource(db, admin, resourceId);
  assert.equal(result.chunks, 2);
  const chunks = (
    await db.query<{ page_number: number; content: string }>(
      "SELECT page_number,content FROM resource_chunks WHERE resource_id=$1 ORDER BY ordinal",
      [resourceId],
    )
  ).rows;
  assert.deepEqual(
    chunks.map((c) => c.page_number),
    [1, 2],
  );
  assert.match(chunks[1].content, /variance/);
  await updateResource(db, admin, {
    id: resourceId,
    title: "Statistics lecture",
    lessonId,
    published: true,
    archived: false,
  });
  assert.equal((await listResources(db, student, lessonId)).length, 1);
  assert.equal(
    (await readResource(db, student, resourceId)).filename,
    "stats.pdf",
  );
});
test("students, demo and unrelated semesters cannot administer or read restricted resources", async () => {
  await assert.rejects(
    createChapter(db, student, "statistics", "No permission"),
    /administrators/,
  );
  await assert.rejects(
    uploadResource(db, student, {
      lessonId,
      title: "Invalid",
      kind: "NOTE",
      filename: "a.txt",
      mime: "text/plain",
      bytes: Buffer.from("some text"),
    }),
    /administrators/,
  );
  await assert.rejects(
    processResource(db, student, resourceId),
    /administrators/,
  );
  await assert.rejects(
    updateResource(db, student, {
      id: resourceId,
      title: "Invalid",
      lessonId,
      published: true,
      archived: false,
    }),
    /administrators/,
  );
  await assert.rejects(
    readResource(db, { ...student, is_demo: true }, resourceId),
    /not available/,
  );
  await db.exec(
    "INSERT INTO semesters VALUES('other-semester','year-1','Other'); INSERT INTO class_groups VALUES('other-class','other-semester','Other class');",
  );
  await assert.rejects(
    readResource(db, { ...student, group_id: "other-class" }, resourceId),
    /not available/,
  );
  await assert.rejects(
    askTutor(
      db,
      { ...student, group_id: "other-class" },
      { lessonId },
      "Explain variance",
    ),
    /not available/,
  );
});
test("upload validation rejects mismatched, oversized, binary, empty and corrupted files", async () => {
  assert.throws(
    () => validateFile("bad.pdf", "application/pdf", Buffer.from("not a PDF")),
    /Only PDF/,
  );
  assert.throws(
    () =>
      validateFile(
        "bad.html",
        "text/html",
        Buffer.from("<script>bad</script>"),
      ),
    /Only PDF/,
  );
  assert.throws(
    () =>
      validateFile("big.txt", "text/plain", new Uint8Array(MAX_FILE_BYTES + 1)),
    /5 MB/,
  );
  assert.throws(
    () => validateFile("bad.txt", "text/plain", new Uint8Array([0, 255])),
    /UTF-8/,
  );
  assert.throws(() => chunkPages([{ page: 1, text: "" }]), /No readable text/);
  const id = await uploadResource(db, admin, {
    lessonId,
    title: "Broken document",
    kind: "PDF",
    filename: "broken.pdf",
    mime: "application/pdf",
    bytes: Buffer.from("%PDF-1.4\ncorrupt"),
  });
  await assert.rejects(processResource(db, admin, id), /Could not extract/);
  assert.equal((await readResource(db, admin, id)).ingestion_status, "failed");
});
test("grounded Tutor uses authorized page citations and refuses invented citations or quotes", async () => {
  const answer = await askTutor(
    db,
    student,
    { lessonId },
    "Explain sample variance",
    async (input) => {
      const source = input.sources.find((s) =>
        s.text.includes("Sample variance"),
      )!;
      assert.ok(source);
      return {
        supported: true,
        paragraphs: [
          {
            text: "For a sample, divide the squared deviations by n minus one.",
            citations: [
              {
                id: source.id,
                quote:
                  "Sample variance divides the sum of squared deviations by n minus one.",
              },
            ],
          },
        ],
      };
    },
  );
  assert.equal(answer.status, "grounded");
  assert.equal(answer.paragraphs[0].sources[0].page, 2);
  assert.match(
    answer.paragraphs[0].sources[0].label,
    /Statistics — Chapter 2.*Page 2/,
  );
  for (const bad of ["id", "quote"]) {
    const result = await askTutor(
      db,
      student,
      { lessonId },
      "Explain sample variance",
      async (input) => ({
        supported: true,
        paragraphs: [
          {
            text: "Unsupported answer",
            citations: [
              {
                id: bad === "id" ? "invented" : input.sources[0].id,
                quote:
                  bad === "quote"
                    ? "This quote was invented."
                    : input.sources[0].text,
              },
            ],
          },
        ],
      }),
    );
    assert.equal(result.status, "insufficient");
    assert.deepEqual(result.paragraphs, []);
  }
});
test("no retrieval result does not call AI; missing configuration and provider outages are friendly", async () => {
  const result = await askTutor(
    db,
    student,
    { lessonId },
    "Explain photosynthesis chloroplast",
    async () => {
      throw new Error("must not call");
    },
  );
  assert.equal(result.status, "insufficient");
  const savedKey = process.env.OPENAI_API_KEY,
    savedModel = process.env.OPENAI_MODEL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  try {
    await assert.rejects(
      askTutor(db, student, { lessonId }, "Explain variance"),
      /not configured/,
    );
  } finally {
    if (savedKey) process.env.OPENAI_API_KEY = savedKey;
    if (savedModel) process.env.OPENAI_MODEL = savedModel;
  }
});
test("unpublishing during generation suppresses stale source content", async () => {
  const result = await askTutor(
    db,
    student,
    { lessonId },
    "Explain variance",
    async (input) => {
      await updateResource(db, admin, {
        id: resourceId,
        title: "Statistics lecture",
        lessonId,
        published: false,
        archived: false,
      });
      return {
        supported: true,
        paragraphs: [
          {
            text: "Sample explanation",
            citations: [
              { id: input.sources[0].id, quote: input.sources[0].text },
            ],
          },
        ],
      };
    },
  );
  assert.equal(result.status, "insufficient");
  assert.equal((await retrieve(db, student, lessonId, "variance")).length, 0);
});
test("text notes preserve text without inventing page numbers; archive hides and restores drafts", async () => {
  const id = await uploadResource(db, admin, {
    lessonId,
    title: "Mean note",
    kind: "NOTE",
    filename: "note.txt",
    mime: "text/plain",
    bytes: Buffer.from(
      "The arithmetic mean equals the sum of the observed values divided by the number of observations.",
    ),
  });
  await processResource(db, admin, id);
  await updateResource(db, admin, {
    id,
    title: "Mean note",
    lessonId,
    published: true,
    archived: false,
  });
  assert.equal(
    (await retrieve(db, student, lessonId, "arithmetic mean"))[0].page_number,
    null,
  );
  await updateResource(db, admin, {
    id,
    title: "Mean note",
    lessonId,
    published: false,
    archived: true,
  });
  await assert.rejects(readResource(db, student, id), /not found/);
  await updateResource(db, admin, {
    id,
    title: "Mean note",
    lessonId,
    published: false,
    archived: false,
  });
  assert.equal((await readResource(db, admin, id)).published, false);
});
test("question context comes from owned current session and saved answer", async () => {
  const sessionId = await startSession(db, student, "statistics", "practice");
  await answerQuestion(db, student, sessionId, "statistics-1", 0);
  const context = await tutorContext(db, student, {
    sessionId,
    lessonId: "forged",
  });
  assert.match(context.question!, /mean/);
  assert.equal(context.selectedAnswer, "6");
  await assert.rejects(
    tutorContext(db, { ...student, id: "someone-else" }, { sessionId }),
    /not found/,
  );
});
test("Responses adapter sends structured server request without storing conversation and handles failure", async () => {
  const key = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = "test-only-key";
  process.env.OPENAI_MODEL = "test-model";
  const transport = mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.model, "test-model");
      return Response.json({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ supported: false, paragraphs: [] }),
              },
            ],
          },
        ],
      });
    },
  );
  try {
    assert.deepEqual(
      await openAIProvider({
        question: "Explain",
        context: { subject: "Statistics", chapter: "Averages", lesson: "Mean" },
        sources: [],
      }),
      { supported: false, paragraphs: [] },
    );
    transport.mock.mockImplementation(
      async () => new Response("unavailable", { status: 429 }),
    );
    await assert.rejects(
      openAIProvider({
        question: "Explain",
        context: { subject: "Statistics", chapter: "Averages", lesson: "Mean" },
        sources: [],
      }),
      /could not respond/,
    );
  } finally {
    transport.mock.restore();
    if (key) process.env.OPENAI_API_KEY = key;
    else delete process.env.OPENAI_API_KEY;
    if (model) process.env.OPENAI_MODEL = model;
    else delete process.env.OPENAI_MODEL;
  }
});
