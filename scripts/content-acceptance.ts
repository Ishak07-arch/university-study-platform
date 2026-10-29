import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fixturePdf } from "./content-fixtures";
const base = "http://127.0.0.1:3000";
let cookie = "";
async function post(
  route: string,
  body: Record<string, unknown> | FormData,
  status = 200,
) {
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
  assert.equal(res.status, status, await res.clone().text());
  return res;
}
async function main() {
  const fixture = JSON.parse(await readFile(".data/qa-fixture.json", "utf8"));
  await post("/api/actions", {
    action: "login",
    email: "admin@folio-qa.invalid",
    password: fixture.password,
  });
  const adminCookie = cookie;
  const { id: chapter } = await post("/api/content", {
    action: "chapter",
    subjectId: "statistics",
    title: "Chapter 2 — Course materials",
  });
  const { id: lessonId } = await post("/api/content", {
    action: "lesson",
    chapterId: chapter,
    title: "Mean and variance",
    body: "Read the lecture notes to understand the mean and sample variance.",
  });
  const form = new FormData();
  form.set("lessonId", lessonId);
  form.set("title", "Statistics lecture notes");
  form.set("kind", "PDF");
  form.set(
    "file",
    new Blob([fixturePdf()], { type: "application/pdf" }),
    "lecture.pdf",
  );
  const { id } = await post("/api/content", form);
  await post(
    "/api/content",
    {
      action: "update",
      id,
      title: "Statistics lecture notes",
      lessonId,
      published: true,
      archived: false,
    },
    400,
  );
  await post("/api/content", { action: "process", id });
  await post("/api/actions", {
    action: "login",
    email: "student@folio-qa.invalid",
    password: fixture.password,
  });
  const studentCookie = cookie;
  assert.equal(
    (await (await get("/api/content?lesson=" + lessonId)).json()).resources
      .length,
    0,
  );
  await get("/api/content/" + id, 404);
  await get("/api/content", 403);
  await post("/api/content", form, 403);
  await post(
    "/api/content",
    { action: "chapter", subjectId: "statistics", title: "Denied" },
    403,
  );
  cookie = adminCookie;
  form.set(
    "file",
    new Blob(["invalid"], { type: "application/pdf" }),
    "fake.pdf",
  );
  await post("/api/content", form, 400);
  await post("/api/content", {
    action: "update",
    id,
    title: "Statistics lecture notes",
    lessonId,
    published: true,
    archived: false,
  });
  cookie = studentCookie;
  const resources = (
    await (await get("/api/content?lesson=" + lessonId)).json()
  ).resources;
  assert.equal(resources[0].page_count, 2);
  assert.equal(resources[0].published, true);
  const file = await get("/api/content/" + id);
  assert.match(file.headers.get("content-disposition") || "", /attachment/);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), fixturePdf());
  const none = await post("/api/tutor", {
    lessonId,
    message: "Explain chloroplast photosynthesis",
  });
  assert.equal(none.status, "insufficient");
  const missing = await post(
    "/api/tutor",
    { lessonId, message: "Explain sample variance" },
    503,
  );
  assert.match(missing.error, /not configured/);
  await post(
    "/api/tutor",
    { lessonId: "not-authorized", message: "Explain sample variance" },
    404,
  );
  const csrf = await fetch(base + "/api/tutor", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: "https://untrusted.invalid",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ lessonId, message: "Explain variance" }),
  });
  assert.equal(csrf.status, 403);
  await post("/api/actions", { action: "logout" });
  await post("/api/actions", { action: "demo" });
  await get("/api/content/" + id, 404);
  cookie = adminCookie;
  await post("/api/content", {
    action: "update",
    id,
    title: "Statistics lecture notes",
    lessonId,
    published: false,
    archived: false,
  });
  await post("/api/actions", {
    action: "login",
    email: "student@folio-qa.invalid",
    password: fixture.password,
  });
  await get("/api/content/" + id, 404);
  // Leave a published fixture for browser review in this isolated database only.
  cookie = adminCookie;
  await post("/api/content", {
    action: "update",
    id,
    title: "Statistics lecture notes",
    lessonId,
    published: true,
    archived: false,
  });
  await writeFile(
    ".data/content-qa.json",
    JSON.stringify({ lessonId, resourceId: id }),
  );
  console.log(
    "Content HTTP acceptance passed: admin upload/extract/publish, PDF download/pages, draft protection, student and demo denial, invalid file, CSRF, no sources, missing AI configuration, unpublish.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
