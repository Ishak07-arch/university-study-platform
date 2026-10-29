import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:3000";
let cookie = "";
const fixtureMode = process.argv.includes("--fixture");
async function post(route: string, body: unknown, status = 200) {
  const res = await fetch(base + route, {
    method: "POST",
    headers: {
      Origin: base,
      Cookie: cookie,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await res.json();
  assert.equal(res.status, status, JSON.stringify(data));
  const c = res.headers.get("set-cookie");
  if (c) cookie = c.split(";")[0];
  return data;
}
async function get(route: string, status = 200) {
  const res = await fetch(base + route, { headers: { Cookie: cookie } });
  const data = await res.json();
  assert.equal(res.status, status, JSON.stringify(data));
  return data;
}
async function main() {
  const { password } = JSON.parse(
    await readFile(".data/qa-fixture.json", "utf8"),
  );
  await post("/api/actions", {
    action: "login",
    email: "admin@folio-qa.invalid",
    password,
  });
  const adminCookie = cookie;
  const { id: chapter } = await post("/api/content", {
    action: "chapter",
    subjectId: "statistics",
    title: "Exercise QA chapter",
  });
  const { id: lesson } = await post("/api/content", {
    action: "lesson",
    chapterId: chapter,
    title: "Sample variance practice",
    body: "Read the source and practise sample variance.",
  });
  const form = new FormData();
  form.set("lessonId", lesson);
  form.set("title", "QA sample variance notes");
  form.set("kind", "NOTE");
  form.set(
    "file",
    new Blob(
      [
        "Sample variance divides the sum of squared deviations by n minus one. A statistic describes a sample.",
      ],
      { type: "text/plain" },
    ),
    "variance.txt",
  );
  const { id: resource } = await post("/api/content", form);
  await post("/api/content", { action: "process", id: resource });
  const publication = {
    action: "update",
    id: resource,
    lessonId: lesson,
    title: "QA sample variance notes",
    published: true,
    archived: false,
  };
  await post("/api/content", publication);
  const manual = {
    lessonId: lesson,
    resourceId: resource,
    type: "numeric",
    difficulty: 2,
    topic: "Sample variance",
    prompt: "Calculate the sample variance of 3, 5 and 7.",
    options: [],
    answer: 0,
    expected: { value: 4, tolerance: 0.001 },
    explanation:
      "The squared deviations total 8; divide by n−1 = 2 to obtain 4.",
    mistake: "Use n−1 in the denominator.",
  };
  const { id: question } = await post("/api/exercises", {
    action: "save",
    question: manual,
  });
  assert.ok(
    (await get("/api/exercises?lesson=" + lesson)).questions.some(
      (q: { id: string }) => q.id === question,
    ),
  );
  await post("/api/actions", {
    action: "login",
    email: "student@folio-qa.invalid",
    password,
  });
  const studentCookie = cookie;
  await get("/api/exercises?lesson=" + lesson, 403);
  await post("/api/exercises", { action: "save", question: manual }, 403);
  const { id: session } = await post("/api/actions", {
    action: "start",
    subject: "statistics",
    mode: "practice",
    lesson,
  });
  const payload = await get("/api/actions?session=" + session);
  assert.equal(payload.question.id, question);
  assert.equal(payload.question.expected, undefined);
  assert.equal(payload.question.answer, undefined);
  assert.equal(payload.question.explanation, undefined);
  assert.equal(payload.question.generation, undefined);
  assert.equal(payload.question.source.resourceId, resource);
  await post(
    "/api/actions",
    {
      action: "answer",
      session,
      question,
      selected: "NaN",
      correct: true,
      xp: 100,
    },
    400,
  );
  const attempt = {
    action: "answer",
    session,
    question,
    selected: "2.667",
    correct: true,
    xp: 100,
  };
  assert.equal((await post("/api/actions", attempt)).correct, false);
  assert.equal((await post("/api/actions", attempt)).repeated, true);
  assert.equal(
    (await post("/api/actions", { ...attempt, selected: "4.0005" })).xp,
    7,
  );
  assert.equal(
    (await post("/api/actions", { ...attempt, selected: "4" })).xp,
    0,
  );
  await post("/api/actions", { action: "next", session });
  const practice = await post("/api/exercises", {
    action: "practice",
    lessonId: lesson,
  });
  assert.ok(practice.id);
  const generated = await get("/api/actions?session=" + practice.id);
  if (fixtureMode) {
    assert.equal(generated.question.origin, "generated");
    assert.equal(generated.question.similar, true);
    assert.equal(generated.question.expected, undefined);
    assert.equal(generated.question.source.resourceId, resource);
    const similar = await post("/api/exercises", {
      action: "similar",
      sessionId: practice.id,
    });
    const next = await get("/api/actions?session=" + similar.id);
    assert.notEqual(next.question.id, generated.question.id);
    assert.notEqual(next.question.prompt, generated.question.prompt);
    assert.equal(next.question.topic, generated.question.topic);
    assert.equal(next.question.source.resourceId, resource);
  } else {
    assert.equal(generated.question.origin, "manual");
    assert.match(practice.message, /could not be prepared/);
  }
  await post("/api/actions", {
    action: "login",
    email: "classmate@folio-qa.invalid",
    password,
  });
  await get("/api/actions?session=" + practice.id, 404);
  await post(
    "/api/exercises",
    { action: "similar", sessionId: practice.id },
    404,
  );
  cookie = adminCookie;
  await post("/api/content", { ...publication, published: false });
  cookie = studentCookie;
  const hidden = await get("/api/actions?session=" + practice.id);
  assert.equal(hidden.question, null);
  assert.match(hidden.notice, /unavailable/);
  await post(
    "/api/actions",
    {
      action: "answer",
      session: practice.id,
      question: generated.question.id,
      selected: "4",
    },
    409,
  );
  assert.equal(
    (await post("/api/actions", { action: "next", session: practice.id })).xp,
    0,
  );
  const csrf = await fetch(base + "/api/exercises", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      Origin: "https://other.invalid",
    },
    body: JSON.stringify({ action: "practice", lessonId: lesson }),
  });
  assert.equal(csrf.status, 403);
  cookie = adminCookie;
  await post("/api/content", publication);
  const { id: revision } = await post("/api/exercises", {
    action: "save",
    question: {
      ...manual,
      id: question,
      prompt: "Find sample variance for the sample 3, 5, 7.",
    },
  });
  assert.notEqual(revision, question);
  await post("/api/exercises", { action: "disable", id: revision });
  await writeFile(
    ".data/exercise-qa.json",
    JSON.stringify(
      { lesson, resource, question, generatedSession: practice.id },
      null,
      2,
    ),
  );
  console.log(
    `Exercise HTTP acceptance passed (${fixtureMode ? "labeled QA provider fixture" : "AI-unavailable fallback"}): admin create/edit/delete, server numeric checking, retries/correction, XP replay, answer-key privacy, ownership, publication withdrawal, and CSRF.`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
