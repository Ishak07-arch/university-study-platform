import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// Run against the isolated QA server prepared by qa:setup.
const base = process.env.FOLIO_QA_ORIGIN || "http://127.0.0.1:3000";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error("Use the loopback QA server.");
async function main() {
  const fixture = JSON.parse(await readFile(".data/qa-fixture.json", "utf8"));
  async function login(email: string) {
    const r = await fetch(base + "/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({
        action: "login",
        email,
        password: fixture.password,
      }),
    });
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie")!.split(";")[0];
  }
  const get = (path: string, cookie: string) =>
    fetch(base + path, { headers: { Cookie: cookie }, redirect: "manual" });
  const admin = await login("admin@folio-qa.invalid"),
    prof = await login("professor@folio-qa.invalid"),
    student = await login("student@folio-qa.invalid"),
    other = await login("unrelated@folio-qa.invalid");
  const view = "/professor?group=group-a&subject=statistics";
  const decode = (s: string) =>
    s
      .replaceAll("&quot;", '"')
      .replaceAll("&#x27;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&");
  async function submit(
    page: string,
    markup: string,
    match: (html: string) => boolean,
    cookie: string,
    fields: Record<string, string>,
  ) {
    const form = (markup.match(/<form\b[^>]*>[\s\S]*?<\/form>/g) || []).find(
      match,
    );
    assert.ok(form, "Expected visible workflow form");
    const body = new FormData();
    for (const tag of form.match(/<input\b[^>]+>/g) || []) {
      if (!tag.includes('type="hidden"')) continue;
      const key = tag.match(/\bname="([^"]+)"/)?.[1];
      if (key)
        body.append(
          decode(key),
          decode(tag.match(/\bvalue="([^"]*)"/)?.[1] || ""),
        );
    }
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    const r = await fetch(base + page, {
      method: "POST",
      headers: { Origin: base, Cookie: cookie },
      body,
      redirect: "manual",
    });
    assert.equal(r.status, 303, "Expected a server action redirect");
    return decodeURIComponent(r.headers.get("location") || "");
  }
  assert.equal((await get("/api/actions", prof)).status, 403);
  assert.ok(
    !(await (await get(view, student)).text()).includes(
      "Create verified challenge",
    ),
  );
  const staff = await (await get(view, admin)).text(),
    assign = (f: string) =>
      f.includes('value="qa-professor"') && f.includes(">Assign<");
  assert.match(
    await submit(view, staff, assign, student, {}),
    /administrators/,
  );
  assert.match(await submit(view, staff, assign, prof, {}), /administrators/);
  assert.match(await submit(view, staff, assign, admin, {}), /Saved/);
  const workspace = await (await get(view, prof)).text();
  assert.ok(workspace.includes("Create verified challenge"));
  const create = (f: string) => f.includes('name="question"');
  const title = "QA written challenge " + Date.now(),
    fields = {
      title,
      instructions: "Explain why the answer follows.",
      deadline: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
      question: "",
      academic: "on",
      xp: "3",
    };
  assert.match(await submit(view, workspace, create, prof, fields), /Saved/);
  const listed = await (await get("/challenges", student)).text();
  assert.ok(listed.includes(title));
  assert.ok(!(await (await get("/challenges", other)).text()).includes(title));
  assert.match(
    await submit(
      "/challenges",
      listed,
      (f) => f.includes('name="response"'),
      student,
      { response: "My calculation and explanation." },
    ),
    /Submitted/,
  );
  const review = await (await get(view, prof)).text();
  assert.match(
    await submit(view, review, (f) => f.includes('name="decision"'), prof, {
      decision: "approve",
      note: "Checked",
    }),
    /Saved/,
  );
  assert.ok(
    (await (await get("/challenges", student)).text()).includes(
      "1 verified academic reward earned",
    ),
  );
  console.log(
    "Professor HTTP flow passed: role gates, assignment, publication, class isolation, submission, verification and reward.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
