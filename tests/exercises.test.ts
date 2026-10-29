import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/server/db";
import type { Profile, Question, StudySession } from "../src/lib/types";
import { seed } from "../src/server/seed";
import {
  saveManualQuestion,
  disableQuestion,
  checkAnswer,
  availableQuestion,
  questionSource,
} from "../src/server/questions";
import {
  buildExercise,
  generateExercise,
  exerciseProvider,
  type ExerciseDraft,
  type GenerationInput,
} from "../src/server/exercise-generation";
import { preparePractice } from "../src/server/exercise-sessions";
import {
  answerQuestion,
  advanceSession,
  startSession,
} from "../src/server/learning";
import {
  createChapter,
  createLesson,
  uploadResource,
  processResource,
  updateResource,
} from "../src/server/content";
let pg: PGlite, db: Db, lesson: string, resource: string, chunk: string;
const student: Profile = {
  id: "exercise-student",
  name: "Student",
  email: "exercise@example.invalid",
  role: "student",
  group_id: "group-a",
  daily_goal: 30,
  timezone: "Africa/Lagos",
  is_demo: false,
};
const admin = { ...student, id: "exercise-admin", role: "admin" as const };
const quote =
  "Sample variance divides the sum of squared deviations by n minus one.";
const draft = (): ExerciseDraft => ({
  sourceId: chunk,
  quote,
  template: "variance",
  answerText: "",
  type: "numeric",
});
const manual = (overrides: Record<string, unknown> = {}) => ({
  lessonId: lesson,
  type: "numeric",
  difficulty: 2,
  topic: "Sample variance",
  prompt: "What is the sample variance of 3, 5 and 7?",
  options: [],
  answer: 0,
  expected: { value: 4, tolerance: 0.001 },
  explanation: "The squared deviations sum to 8. Divide by n−1 = 2 to get 4.",
  mistake: "Use n−1 for a sample variance.",
  ...overrides,
});
const question = async (id: string) =>
  (await db.query<Question>("SELECT * FROM questions WHERE id=$1", [id]))
    .rows[0];
before(async () => {
  pg = await PGlite.create();
  db = pg as unknown as Db;
  await db.exec(await readFile("db/001-foundation.sql", "utf8"));
  await seed(db);
  await db.exec(await readFile("db/002-course-content.sql", "utf8"));
  await db.exec(await readFile("db/003-exercises.sql", "utf8"));
  await db.exec(await readFile("db/003-exercises.sql", "utf8"));
  for (const u of [student, admin])
    await db.query(
      "INSERT INTO users(id,email,name,role,group_id) VALUES($1,$2,$3,$4,$5)",
      [u.id, u.id + "@test.invalid", u.name, u.role, u.group_id],
    );
  const chapter = await createChapter(
    db,
    admin,
    "statistics",
    "Exercise sources",
  );
  lesson = await createLesson(
    db,
    admin,
    chapter,
    "Sample variance",
    "Read and practise calculating sample variance.",
  );
  resource = await uploadResource(db, admin, {
    lessonId: lesson,
    title: "Variance notes",
    kind: "NOTE",
    filename: "variance.txt",
    mime: "text/plain",
    bytes: Buffer.from(
      quote +
        " A statistic describes a sample. Different observations produce different estimates.",
    ),
  });
  await processResource(db, admin, resource);
  await updateResource(db, admin, {
    id: resource,
    title: "Variance notes",
    lessonId: lesson,
    published: true,
    archived: false,
  });
  chunk = (
    await db.query<{ id: string }>(
      "SELECT id FROM resource_chunks WHERE resource_id=$1",
      [resource],
    )
  ).rows[0].id;
});
after(async () => {
  await pg.close();
});
test("manual numeric attempts are validated, numbered, corrected and rewarded once", async () => {
  const id = await saveManualQuestion(db, admin, manual());
  await assert.rejects(
    saveManualQuestion(db, student, manual()),
    /administrators/,
  );
  const sid = await startSession(
    db,
    student,
    "statistics",
    "practice",
    10,
    lesson,
    id,
  );
  for (const invalid of ["", "Infinity", "NaN", "4 kg", "1,000"]) {
    await assert.rejects(answerQuestion(db, student, sid, id, invalid));
  }
  await assert.rejects(
    answerQuestion(db, { ...student, id: "another-user" }, sid, id, "4"),
    /moved on/,
  );
  assert.equal(
    (await answerQuestion(db, student, sid, id, "2.667")).correct,
    false,
  );
  assert.equal(
    (await answerQuestion(db, student, sid, id, "2.667")).repeated,
    true,
  );
  const corrected = await answerQuestion(db, student, sid, id, "4.0005");
  assert.equal(corrected.correct, true);
  assert.equal(corrected.xp, 7);
  assert.equal((await answerQuestion(db, student, sid, id, "4")).xp, 0);
  const attempts = (
    await db.query<{ attempt_number: number; answer_value: number }>(
      "SELECT attempt_number,answer_value FROM question_attempts WHERE session_id=$1 ORDER BY attempt_number",
      [sid],
    )
  ).rows;
  assert.deepEqual(
    attempts.map((a) => a.attempt_number),
    [1, 2, 3],
  );
  assert.equal(attempts[2].answer_value, 4.0005);
  const m = (
    await db.query<{ corrected: boolean; occurrences: number }>(
      "SELECT corrected,occurrences FROM mistakes WHERE user_id=$1 AND question_id=$2",
      [student.id, id],
    )
  ).rows[0];
  assert.equal(m.corrected, true);
  assert.equal(m.occurrences, 2);
  await advanceSession(db, student, sid);
  const revised = await saveManualQuestion(
    db,
    admin,
    manual({
      id,
      prompt: "For observations 3, 5, 7 find the sample variance.",
    }),
  );
  const replay = await startSession(
    db,
    student,
    "statistics",
    "practice",
    10,
    lesson,
    revised,
  );
  assert.equal((await answerQuestion(db, student, replay, revised, "4")).xp, 0);
  assert.equal((await advanceSession(db, student, replay)).xp, 0);
  assert.equal(await availableQuestion(db, student, id), undefined);
});
test("manual choice and short text use server keys and explicit aliases", async () => {
  for (const input of [
    manual({ type: "choice", options: ["Yes", "No"], answer: 4 }),
    manual({ expected: {} }),
    manual({ type: "text", expected: { aliases: [] } }),
  ])
    await assert.rejects(saveManualQuestion(db, admin, input));
  const text = await saveManualQuestion(
    db,
    admin,
    manual({
      type: "text",
      prompt: "Name the measure described by the squared deviations formula.",
      expected: { aliases: ["sample variance", "variance of a sample"] },
    }),
  );
  const s = await startSession(
    db,
    student,
    "statistics",
    "practice",
    10,
    lesson,
    text,
  );
  assert.equal(
    (await answerQuestion(db, student, s, text, "  SAMPLE   VARIANCE "))
      .correct,
    true,
  );
  await advanceSession(db, student, s);
  const choice = await saveManualQuestion(
    db,
    admin,
    manual({
      type: "choice",
      options: ["n", "n−1", "n+1"],
      answer: 1,
      expected: {},
    }),
  );
  const sc = await startSession(
    db,
    student,
    "statistics",
    "practice",
    10,
    lesson,
    choice,
  );
  await assert.rejects(answerQuestion(db, student, sc, choice, 1.5));
  await assert.rejects(answerQuestion(db, student, sc, choice, "1"));
  assert.equal(
    (await answerQuestion(db, student, sc, choice, 1)).correct,
    true,
  );
  await advanceSession(db, student, sc);
});
test("all supported numeric templates yield finite checked answers with material gates", () => {
  const samples = {
    mean: "The arithmetic mean is the sum of measurements divided by the number of measurements.",
    variance: quote,
    probability:
      "For equally likely outcomes, probability is favourable outcomes divided by the total outcomes.",
    linear:
      "A linear equation has the form ax + b = c; subtract b, then divide by a.",
    equity:
      "The accounting equation is assets = liabilities + equity for a business.",
    elasticity:
      "Price elasticity of demand is the percentage change in quantity demanded divided by the percentage change in price.",
  };
  for (const [template, text] of Object.entries(samples))
    for (let variant = 0; variant < 4; variant++) {
      const d = {
        sourceId: "fixture",
        template,
        quote: text,
        answerText: "",
        type: "numeric",
      };
      const q = buildExercise(d, { id: "fixture", content: text }, variant);
      assert.ok(Number.isFinite(q.expected.value));
      assert.equal(
        checkAnswer(q as Question, String(q.expected.value)).correct,
        true,
      );
      assert.throws(() =>
        buildExercise(
          {
            ...d,
            quote: "This source discusses unrelated archaeology and ceramics.",
          },
          {
            id: "fixture",
            content:
              "This source discusses unrelated archaeology and ceramics.",
          },
        ),
      );
    }
  assert.throws(() =>
    buildExercise(
      { ...draft(), sourceId: "invented" },
      { id: chunk, content: quote },
    ),
  );
  assert.throws(() =>
    buildExercise(
      {
        ...draft(),
        template: "variance",
        quote: "Unsupported citation with fabricated calculation content.",
      },
      { id: chunk, content: quote },
    ),
  );
});
test("generated exercise caches, similar preserves concept/source and cannot farm rewards", async () => {
  let calls = 0;
  const provider = async () => {
    calls++;
    return draft();
  };
  const first = await generateExercise(
    db,
    student,
    lesson,
    undefined,
    provider,
  );
  assert.ok(first.id);
  assert.equal(
    (await generateExercise(db, student, lesson, undefined, provider)).id,
    first.id,
  );
  assert.equal(calls, 1);
  let id = first.id!,
    previousPrompt = "",
    total = 0;
  for (let i = 0; i < 5; i++) {
    const q = await question(id);
    assert.notEqual(q.prompt, previousPrompt);
    previousPrompt = q.prompt;
    assert.equal(q.generation?.template, "variance");
    assert.equal(q.source_chunk_id, chunk);
    assert.equal(q.difficulty, 2);
    assert.equal((await questionSource(db, q))?.resourceId, resource);
    const s = await startSession(
      db,
      student,
      "statistics",
      "practice",
      10,
      lesson,
      id,
    );
    if (i === 0) {
      const wrong = await answerQuestion(
        db,
        student,
        s,
        id,
        (8 / 3).toFixed(3),
      );
      assert.match(wrong.mistake, /n instead of n−1/);
    }
    const results = await Promise.all([
      answerQuestion(db, student, s, id, String(q.expected!.value)),
      answerQuestion(db, student, s, id, String(q.expected!.value)),
    ]);
    total += results.reduce((sum, r) => sum + r.xp, 0);
    total += (await advanceSession(db, student, s)).xp;
    id = (await generateExercise(db, student, lesson, id, provider)).id!;
  }
  assert.equal(total, 7); // The subject completion reward was already earned by the manual session.
  assert.equal(calls, 1);
  assert.equal(
    (
      await db.query(
        "SELECT id FROM questions WHERE origin='generated' AND lesson_id=$1",
        [lesson],
      )
    ).rows.length,
    4,
  );
});
test("source-reading questions only blank whole exact terms and retain valid choice answers", () => {
  const text =
    "Sample variance divides the sum of squared deviations by n minus one. apple orange banana pear";
  for (const type of ["choice", "text"]) {
    const q = buildExercise(
      {
        sourceId: "read",
        template: "cloze",
        quote,
        answerText: "squared deviations",
        type,
      },
      { id: "read", content: text },
    );
    assert.match(q.prompt, /_____/);
    assert.ok(q.explanation.includes(quote));
    if (type === "choice")
      assert.equal(q.options[q.answer], "squared deviations");
    else assert.deepEqual(q.expected.aliases, ["squared deviations"]);
  }
  assert.throws(() =>
    buildExercise(
      {
        sourceId: "read",
        template: "cloze",
        quote,
        answerText: "vari",
        type: "text",
      },
      { id: "read", content: text },
    ),
  );
});
test("repeated mistakes prioritise a related question and are never shared between students", async () => {
  const chapter = await createChapter(
      db,
      admin,
      "statistics",
      "Targeted practice",
    ),
    l = await createLesson(
      db,
      admin,
      chapter,
      "Targeted basics",
      "Practise the requested topic using these exercises.",
    );
  const relevant = await saveManualQuestion(
    db,
    admin,
    manual({ lessonId: l, topic: "Denominators" }),
  );
  await saveManualQuestion(
    db,
    admin,
    manual({ lessonId: l, topic: "Another topic" }),
  );
  const s = await startSession(
    db,
    student,
    "statistics",
    "practice",
    10,
    l,
    relevant,
  );
  assert.equal(
    (await answerQuestion(db, student, s, relevant, "9")).repeated,
    false,
  );
  assert.equal(
    (await answerQuestion(db, student, s, relevant, "9")).repeated,
    true,
  );
  // Close only the test's unfinished session to exercise selection in a future session.
  await db.query("UPDATE study_sessions SET completed_at=now() WHERE id=$1", [
    s,
  ]);
  const next = await startSession(db, student, "statistics", "practice", 10, l);
  const ss = (
    await db.query<StudySession>("SELECT * FROM study_sessions WHERE id=$1", [
      next,
    ])
  ).rows[0];
  assert.equal(ss.question_ids[0], relevant);
  await assert.rejects(
    preparePractice(db, { ...student, id: "other" }, { sessionId: next }),
    /not found/,
  );
  await assert.rejects(
    preparePractice(db, { ...student, group_id: "missing" }, { lessonId: l }),
  );
  await assert.rejects(
    preparePractice(db, { ...student, is_demo: true }, { lessonId: l }),
  );
});
test("withdrawn and re-extracted sources cannot leak via cached questions or earn XP", async () => {
  const gen = (
    await db.query<Question>(
      "SELECT * FROM questions WHERE origin='generated' AND lesson_id=$1 LIMIT 1",
      [lesson],
    )
  ).rows[0];
  const s = await startSession(
    db,
    student,
    "statistics",
    "practice",
    10,
    lesson,
    gen.id,
  );
  await updateResource(db, admin, {
    id: resource,
    title: "Variance notes",
    lessonId: lesson,
    published: false,
    archived: false,
  });
  assert.equal(await availableQuestion(db, student, gen.id), undefined);
  assert.equal(await questionSource(db, gen), null);
  await assert.rejects(
    answerQuestion(db, student, s, gen.id, "4"),
    /no longer available/,
  );
  assert.equal((await advanceSession(db, student, s)).xp, 0);
  await updateResource(db, admin, {
    id: resource,
    title: "Variance notes",
    lessonId: lesson,
    published: true,
    archived: false,
  });
  await disableQuestion(db, admin, gen.id);
  assert.equal(await availableQuestion(db, student, gen.id), undefined);
  await processResource(db, admin, resource);
  await updateResource(db, admin, {
    id: resource,
    title: "Variance notes",
    lessonId: lesson,
    published: true,
    archived: false,
  });
  assert.equal(
    (await db.query("SELECT id FROM resource_chunks WHERE id=$1", [chunk])).rows
      .length,
    0,
  );
  for (const q of (
    await db.query<Question>(
      "SELECT * FROM questions WHERE origin='generated' AND lesson_id=$1",
      [lesson],
    )
  ).rows)
    assert.equal(await availableQuestion(db, student, q.id), undefined);
});
test("malformed generation, missing AI and no source return existing practice or a useful empty state", async () => {
  const existing = (
    await db.query<{ id: string }>(
      "SELECT id FROM questions WHERE lesson_id=$1 AND origin='manual' AND disabled=false LIMIT 1",
      [lesson],
    )
  ).rows[0].id;
  for (const provider of [
    async () => ({}),
    async () => {
      throw new Error("offline");
    },
    async () => ({ ...draft(), sourceId: "wrong" }),
  ]) {
    const r = await generateExercise(db, student, lesson, undefined, provider);
    assert.ok(r.id);
    assert.equal((await question(r.id!)).origin, "manual");
    assert.match(r.message, /could not/);
  }
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const r = await generateExercise(db, student, lesson);
    assert.ok(r.id);
    assert.match(r.message, /could not/);
  } finally {
    if (savedKey) process.env.OPENAI_API_KEY = savedKey;
  }
  const chapter = await createChapter(db, admin, "statistics", "Empty sources"),
    l = await createLesson(
      db,
      admin,
      chapter,
      "Empty lesson",
      "Material has not been published for this lesson.",
    );
  const empty = await preparePractice(
    db,
    student,
    { lessonId: l },
    async () => {
      throw new Error("must not call");
    },
  );
  assert.equal(empty.id, null);
  assert.match(empty.message, /No suitable exercise/);
  assert.ok(existing);
});
test("unpublish during generation rejects the newly generated question", async () => {
  const qid = await saveManualQuestion(db, admin, manual());
  const newChunk = (
    await db.query<{ id: string }>(
      "SELECT id FROM resource_chunks WHERE resource_id=$1",
      [resource],
    )
  ).rows[0].id;
  const r = await generateExercise(db, student, lesson, undefined, async () => {
    await updateResource(db, admin, {
      id: resource,
      title: "Variance notes",
      lessonId: lesson,
      published: false,
      archived: false,
    });
    return { ...draft(), sourceId: newChunk };
  });
  assert.ok(r.id);
  assert.equal((await question(r.id!)).origin, "manual");
  assert.match(r.message, /could not/);
  assert.ok(qid);
});
test("exercise provider uses structured server request, no history, and rejects outages", async () => {
  const key = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = "test-only";
  process.env.OPENAI_MODEL = "test-model";
  const input: GenerationInput = {
    lesson: "Variance",
    sources: [{ id: chunk, content: quote }],
    templates: ["variance"],
  };
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const b = JSON.parse(String(options?.body));
      assert.equal(b.store, false);
      assert.equal(b.text.format.strict, true);
      return Response.json({
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(draft()) }] },
        ],
      });
    },
  );
  try {
    assert.deepEqual(await exerciseProvider(input), draft());
    fetchMock.mock.mockImplementation(async () =>
      Response.json({ error: "unavailable" }, { status: 429 }),
    );
    await assert.rejects(exerciseProvider(input));
  } finally {
    fetchMock.mock.restore();
    if (key) process.env.OPENAI_API_KEY = key;
    else delete process.env.OPENAI_API_KEY;
    if (model) process.env.OPENAI_MODEL = model;
    else delete process.env.OPENAI_MODEL;
  }
});
