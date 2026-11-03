import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Snapshot, SessionPayload } from "../src/lib/types";
const base = "http://127.0.0.1:3000";
let cookie = "";
async function post(
  action: string,
  data: Record<string, unknown> = {},
  status = 200,
) {
  const res = await fetch(base + "/api/actions", {
    method: "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ action, ...data }),
  });
  const body = await res.json();
  assert.equal(res.status, status, `${action}: ${JSON.stringify(body)}`);
  const token = res.headers.get("set-cookie");
  if (token) cookie = token.split(";")[0];
  return body;
}
async function snapshot() {
  const res = await fetch(base + "/api/actions", {
    headers: { Cookie: cookie },
  });
  assert.equal(res.status, 200);
  return res.json() as Promise<Snapshot>;
}
async function main() {
  const fixture = JSON.parse(await readFile(".data/qa-fixture.json", "utf8"));
  await post("login", {
    email: "admin@folio-qa.invalid",
    password: fixture.password,
  });
  assert.equal((await snapshot()).profile.role, "admin");
  const adminHtml = await (
    await fetch(base + "/admin", { headers: { Cookie: cookie } })
  ).text();
  assert.ok(adminHtml.includes("Create a reminder"));
  const prefix = "Acceptance " + Date.now();
  const types = [
    "HOMEWORK",
    "PRINT",
    "BRING",
    "EXAM",
    "QUIZ",
    "ANNOUNCEMENT",
    "CLASS_PREPARATION",
  ];
  for (const type of types)
    await post("admin-task", {
      subject_id: "statistics",
      group_id: "group-a",
      title: prefix + " " + type,
      description:
        "Restricted to Group A. Bring the printed worksheet mentioned in class.",
      type,
      due_at: new Date(Date.now() + 86400000).toISOString(),
      importance: 3,
    });
  await post(
    "admin-task",
    {
      subject_id: "statistics",
      group_id: "not-a-group",
      title: "Invalid group",
      description: "Must not save",
      type: "PRINT",
      due_at: new Date().toISOString(),
      importance: 2,
    },
    400,
  );
  const created = (await snapshot()).tasks.filter((t) =>
    t.title.startsWith(prefix),
  );
  assert.equal(created.length, 7);
  const task = created[0];
  await post("logout");
  await post("login", {
    email: "student@folio-qa.invalid",
    password: fixture.password,
  });
  let student = await snapshot();
  assert.equal(
    student.tasks.filter((t) => t.title.startsWith(prefix)).length,
    7,
  );
  assert.equal(
    student.tasks.find((t) => t.id === task.id)?.description,
    "Restricted to Group A. Bring the printed worksheet mentioned in class.",
  );
  await post("task", { id: task.id, completed: true, user_id: "qa-classmate" });
  assert.equal(
    (await snapshot()).tasks.find((t) => t.id === task.id)?.completed,
    true,
  );
  await post("logout");
  await post("login", {
    email: "student@folio-qa.invalid",
    password: fixture.password,
  });
  assert.equal(
    (await snapshot()).tasks.find((t) => t.id === task.id)?.completed,
    true,
  );
  await post(
    "admin-task",
    {
      subject_id: "statistics",
      group_id: "group-a",
      title: "Forged",
      description: "",
      type: "BRING",
      due_at: new Date().toISOString(),
      importance: 1,
    },
    403,
  );
  const denied = await (
    await fetch(base + "/admin", { headers: { Cookie: cookie } })
  ).text();
  assert.ok(!denied.includes("Create a reminder"));
  assert.ok(denied.includes("This space is for administrators"));
  const session = await post("start", {
    subject: "economics",
    mode: "practice",
  });
  const before = (await snapshot()).xp;
  await post("xp", { amount: 1000000 }, 403);
  await post("profile", {
    name: "Taylor Student",
    daily_goal: 30,
    timezone: "Africa/Lagos",
    xp: 1000000,
    role: "admin",
    group_id: "qa-group-b",
  });
  student = await snapshot();
  assert.equal(student.xp, before);
  assert.equal(student.profile.role, "student");
  assert.equal(student.profile.group_id, "group-a");
  const ownerCookie = cookie;
  await post("logout");
  await post("login", {
    email: "classmate@folio-qa.invalid",
    password: fixture.password,
  });
  assert.equal(
    (await snapshot()).tasks.find((t) => t.id === task.id)?.completed,
    false,
  );
  assert.equal(
    (
      await fetch(base + "/api/actions?session=" + session.id, {
        headers: { Cookie: cookie },
      })
    ).status,
    404,
  );
  await post(
    "answer",
    { session: session.id, question: "economics-1", selected: 2 },
    409,
  );
  await post("next", { session: session.id }, 404);
  await post("logout");
  await post("login", {
    email: "unrelated@folio-qa.invalid",
    password: fixture.password,
  });
  assert.equal(
    (await snapshot()).tasks.some((t) => t.title.startsWith(prefix)),
    false,
  );
  await post("task", { id: task.id, completed: true }, 404);
  await post("logout");
  await post("demo");
  assert.equal((await snapshot()).profile.group_id, "demo-group");
  assert.equal(
    (await snapshot()).tasks.some((t) => t.title.startsWith(prefix)),
    false,
  );
  await post("task", { id: task.id, completed: true }, 404);
  await post("logout");
  const email = "new-" + Date.now() + "@folio-qa.invalid";
  const password = "Fresh-account-password!";
  await post("register", {
    email,
    password,
    name: "Fresh Student",
    role: "admin",
    group_id: "group-a",
    is_demo: true,
  });
  const pendingCookie = cookie;
  for (const path of [
    "/api/actions",
    "/api/actions?session=" + session.id,
    "/api/study-plan",
    "/api/motivation",
    "/api/content?lesson=statistics-lesson",
    "/api/content/accounting-td3",
    "/api/exercises?progress=statistics",
  ]) {
    const r = await fetch(base + path, { headers: { Cookie: cookie } });
    assert.equal(r.status, 403, path);
    assert.match((await r.json()).error, /approval/);
  }
  await post(
    "approve-enrolment",
    { role: "admin", studentEmail: email, group_id: "group-a" },
    403,
  );
  await post(
    "profile",
    { name: "Forge", timezone: "UTC", daily_goal: 30, group_id: "group-a" },
    403,
  );
  await post("task", { id: task.id, completed: true }, 403);
  await post("demo"); // An existing login cannot turn itself into a demo session.
  for (const path of [
    "/",
    "/challenges",
    "/leaderboard",
    "/tasks",
    "/study/statistics",
    "/resources/accounting-td3",
    "/prep/statistics",
    "/mock/test",
    "/session/test",
  ]) {
    const r = await fetch(base + path, { headers: { Cookie: cookie } });
    assert.match(
      await r.text(),
      /Waiting for class approval|NEXT_REDIRECT[^<]*enrolment/,
      path,
    );
  }
  await post("login", {
    email: "admin@folio-qa.invalid",
    password: fixture.password,
  });
  await post(
    "approve-enrolment",
    { studentEmail: email, group_id: "demo-group" },
    409,
  );
  await post("approve-enrolment", {
    studentEmail: email,
    group_id: "qa-group-b",
  });
  await post(
    "approve-enrolment",
    { studentEmail: email, group_id: "group-a" },
    409,
  );
  cookie = pendingCookie;
  student = await snapshot();
  assert.equal(student.profile.group_id, "qa-group-b");
  assert.ok(!student.tasks.some((t) => t.id === task.id));
  assert.equal(student.xp, 0);
  assert.equal(student.streak, 0);
  assert.equal(student.profile.role, "student");
  assert.ok(student.subjects.every((s) => s.solved === 0));
  const active = await post("start", {
    subject: "statistics",
    mode: "practice",
  });
  const payload = (await (
    await fetch(base + "/api/actions?session=" + active.id, {
      headers: { Cookie: cookie },
    })
  ).json()) as SessionPayload;
  assert.equal("answer" in payload.question!, false);
  await post("answer", {
    session: active.id,
    question: "statistics-1",
    selected: 0,
  });
  assert.equal(
    (
      await post("answer", {
        session: active.id,
        question: "statistics-1",
        selected: 1,
      })
    ).xp,
    7,
  );
  assert.equal(
    (
      await post("answer", {
        session: active.id,
        question: "statistics-1",
        selected: 1,
      })
    ).xp,
    0,
  );
  await post("next", { session: active.id });
  student = await snapshot();
  assert.equal(student.xp, 7);
  assert.equal(student.active?.position, 1);
  assert.equal(
    student.subjects.find((s) => s.id === "statistics")?.progress,
    25,
  );
  assert.equal(student.leaders.find((l) => l.is_you)?.xp, 7);
  await post("logout");
  await post("login", { email, password });
  assert.equal((await snapshot()).active?.position, 1);
  if (process.argv.includes("--production")) {
    await post("forgot", { email }, 503);
  } else {
    const oldCookie = cookie;
    const response = await post("forgot", { email });
    assert.equal(response.token, undefined);
    const mails = await readdir(path.join(fixture.root, "mail"));
    let token = "";
    for (const file of mails) {
      const mail = JSON.parse(
        await readFile(path.join(fixture.root, "mail", file), "utf8"),
      );
      if (mail.to === email) {
        assert.ok(mail.text.includes(base + "/reset-password?token="));
        token = mail.text.match(/token=([a-f0-9]{64})/)[1];
      }
    }
    assert.ok(token);
    await post("reset", { token, password: "Updated-test-password!" });
    assert.equal(
      (await fetch(base + "/api/actions", { headers: { Cookie: oldCookie } }))
        .status,
      401,
    );
    await post("reset", { token, password: "Updated-test-password!" }, 400);
    await post("login", { email, password }, 401);
    await post("login", { email, password: "Updated-test-password!" });
  }
  await post("logout");
  console.log(
    "Acceptance passed: all seven task types, admin login/creation/audit boundary, exact group targeting, per-student completion persistence, cross-user session denial, demo isolation, role/XP forgery denial, fresh accounts, resume, correction rewards, coverage, leaderboard, and password reset lifecycle.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
