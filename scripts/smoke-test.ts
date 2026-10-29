import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
let cookie = "";
async function post(
  action: string,
  data: Record<string, unknown> = {},
  expected = 200,
  origin = base,
) {
  const res = await fetch(base + "/api/actions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ action, ...data }),
  });
  const json = await res.json();
  assert.equal(res.status, expected, JSON.stringify(json));
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return json;
}
async function get(route: string, expected = 200) {
  const res = await fetch(base + route, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
  assert.equal(res.status, expected, route);
  return res;
}
async function main() {
  await get("/api/actions", 401);
  for (const route of ["/profile", "/admin"]) {
    const response = await fetch(base + route, { redirect: "follow" });
    const html = await response.text();
    assert.ok(response.url.includes("/sign-in") || html.includes("/sign-in"));
    assert.ok(!html.includes("profile-form"));
  }
  await post("demo", {}, 403, "https://untrusted.example");
  await post("demo");
  let snapshot = await (await get("/api/actions")).json();
  assert.equal(snapshot.authenticated, true);
  assert.equal(snapshot.profile.role, "student");
  const active = snapshot.active;
  const payload = await (await get("/api/actions?session=" + active.id)).json();
  assert.equal(payload.session.position, 2);
  assert.equal(payload.question.answer, undefined);
  assert.equal(payload.question.explanation, undefined);
  const wrong = await post("answer", {
    session: active.id,
    question: payload.question.id,
    selected: 0,
  });
  assert.equal(wrong.correct, false);
  const corrected = await post("answer", {
    session: active.id,
    question: payload.question.id,
    selected: 1,
  });
  assert.equal(corrected.xp, 7);
  assert.equal(
    (
      await post("answer", {
        session: active.id,
        question: payload.question.id,
        selected: 1,
      })
    ).xp,
    0,
  );
  await post(
    "admin-subject",
    {
      name: "Forbidden",
      code: "NOPE",
      description: "Not allowed",
      semester_id: "semester-1",
    },
    403,
  );
  await post("task", { id: "demo-print-accounting", completed: true });
  snapshot = await (await get("/api/actions")).json();
  assert.equal(
    snapshot.tasks.find((t: { id: string }) => t.id === "demo-print-accounting")
      .completed,
    true,
  );
  await post("profile", {
    name: "Demo Learner",
    daily_goal: 50,
    timezone: "Africa/Lagos",
  });
  snapshot = await (await get("/api/actions")).json();
  assert.equal(snapshot.profile.name, "Demo Learner");
  await post("logout");
  await get("/api/actions", 401);
  const email = "qa-" + Date.now() + "@example.invalid";
  await post("register", {
    email,
    name: "QA Student",
    password: "local-QA-password-2026",
  });
  snapshot = await (await get("/api/actions")).json();
  assert.equal(snapshot.xp, 0);
  assert.equal(snapshot.active, null);
  assert.equal(snapshot.streak, 0);
  assert.equal(snapshot.subjects.length, 5);
  await post("logout");
  await post("login", { email, password: "wrong" }, 401);
  await post("login", { email, password: "local-QA-password-2026" });
  await get("/progress");
  await get("/leaderboard");
  await get("/study/statistics");
  await get("/resources/accounting-td3");
  await post("logout");
  console.log(
    "HTTP smoke tests passed: auth, protected routes, CSRF, resume, feedback, XP deduplication, roles, task persistence, profile, fresh account, and page routes.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
