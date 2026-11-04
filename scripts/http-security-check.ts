// HTTP-level safety net for the isolated QA server (npm run qa:setup, then
// npm run qa:serve [-- --production]). It records today's request-boundary
// behaviour: origin checks, body limits, authentication, roles and login limits.
// Run it after qa:test; it uses throwaway emails and never touches .data/folio.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const base = "http://127.0.0.1:3000";

async function call(
  path: string,
  init: { method?: string; body?: string; origin?: string | null; cookie?: string; type?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (init.origin !== null) headers.Origin = init.origin ?? base;
  if (init.cookie) headers.Cookie = init.cookie;
  if (init.body !== undefined) headers["Content-Type"] = init.type ?? "application/json";
  const res = await fetch(base + path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body,
  });
  const text = await res.text();
  let json: { error?: string } = {};
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
const action = (data: Record<string, unknown>, cookie?: string, origin?: string | null) =>
  call("/api/actions", { body: JSON.stringify(data), cookie, origin });
async function login(email: string, password: string) {
  const r = await action({ action: "login", email, password });
  assert.equal(r.status, 200, email + ": " + JSON.stringify(r.json));
  return r.cookie!;
}

async function main() {
  const fixture = JSON.parse(await readFile(".data/qa-fixture.json", "utf8"));
  const pw: string = fixture.password;
  const student = await login("student@folio-qa.invalid", pw);
  const professor = await login("professor@folio-qa.invalid", pw);

  // 1. Origin checks on every mutation surface.
  for (const origin of [null, "https://attacker.example", base + ".attacker.example"]) {
    const label = String(origin);
    assert.equal((await action({ action: "profile" }, student, origin)).status, 403, "actions " + label);
    for (const path of ["/api/tutor", "/api/exercises", "/api/content"])
      assert.equal(
        (await call(path, { body: "{}", cookie: student, origin })).status,
        403,
        path + " " + label,
      );
  }

  // 2. Body limits and malformed input.
  assert.equal((await action({ action: "login", pad: "x".repeat(21000) })).status, 413);
  assert.equal((await call("/api/actions", { body: "{not json" })).status, 400);
  assert.equal(
    (await call("/api/tutor", { body: JSON.stringify({ message: "x".repeat(6000) }), cookie: student })).status,
    413,
  );

  // 3. Authentication.
  for (const path of ["/api/actions", "/api/motivation", "/api/study-plan", "/api/content"])
    assert.equal((await call(path)).status, 401, path);
  assert.equal((await action({ action: "start", subject: "statistics", mode: "practice" })).status, 401);
  assert.equal((await call("/api/actions", { cookie: "folio_session=" + "0".repeat(64) })).status, 401);

  // 4. Roles: students cannot use admin actions; professors use their own workspace.
  for (const data of [
    { action: "admin-subject", name: "Forged", code: "FX1", description: "Forged subject", semester_id: "semester-1" },
    { action: "approve-enrolment", studentEmail: "unrelated@folio-qa.invalid", group_id: "group-a" },
  ])
    assert.equal((await action(data, student)).status, 403, data.action);
  assert.equal((await call("/api/content", { cookie: student })).status, 403);
  assert.equal(
    (await call("/api/content", { body: JSON.stringify({ action: "chapter", subjectId: "statistics", title: "Forged" }), cookie: student })).status,
    403,
  );
  assert.equal(
    (await call("/api/exercises", { body: JSON.stringify({ action: "disable", id: "statistics-1" }), cookie: student })).status,
    403,
  );
  assert.equal((await call("/api/actions", { cookie: professor })).status, 403);
  assert.match((await call("/api/actions", { cookie: professor })).json.error ?? "", /teaching workspace/);

  // 5. Login limit (current behaviour: 20 attempts per email per 15 minutes).
  const target = "limit-" + Date.now() + "@folio-qa.invalid";
  for (let i = 0; i < 20; i++)
    assert.equal((await action({ action: "login", email: target, password: "wrong-password" })).status, 401, "attempt " + (i + 1));
  const blocked = await action({ action: "login", email: target, password: "wrong-password" });
  assert.equal(blocked.status, 429);
  assert.match(blocked.json.error ?? "", /15 minutes/);

  // 6. Demo access in a loopback preview creates an isolated demo account.
  const demo = await action({ action: "demo" });
  assert.equal(demo.status, 200);
  const snapshot = await call("/api/actions", { cookie: demo.cookie });
  assert.equal(snapshot.status, 200);
  assert.equal((snapshot.json as { profile?: { is_demo?: boolean } }).profile?.is_demo, true);

  console.log("HTTP security checks passed: origin, body limits, authentication, roles, login limit, demo.");
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
