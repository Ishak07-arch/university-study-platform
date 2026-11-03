import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { scopes } from "@/server/teaching";
import { classOverview } from "@/server/teaching-data";
import { staffAction, staffLogout } from "./actions";
export default async function Professor({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; subject?: string; message?: string }>;
}) {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  if (u.is_demo || !["admin", "professor"].includes(u.role)) notFound();
  const db = await getDb(),
    allowed = await scopes(db, u),
    args = await searchParams;
  const scope =
    args.group || args.subject
      ? allowed.find(
          (s) => s.group_id === args.group && s.subject_id === args.subject,
        )
      : allowed[0];
  if (!scope && (args.group || args.subject)) notFound();
  const navigation =
    u.role === "admin" ? (
      <Link href="/admin">← Admin workspace</Link>
    ) : (
      <form action={staffLogout}>
        <button className="text-button">Sign out</button>
      </form>
    );
  if (!scope)
    return (
      <main className="exam-page">
        {navigation}
        <h1>Teaching workspace</h1>
        <p>Your administrator can assign a class and subject here.</p>
      </main>
    );
  const { group_id: g, subject_id: s } = scope,
    action = staffAction.bind(null, g, s),
    { stats, questions, challenges, queue } = await classOverview(db, u, g, s);
  const professors =
    u.role === "admin"
      ? (
          await db.query<{ id: string; name: string; assigned: boolean }>(
            "SELECT id,name,exists(SELECT 1 FROM teaching_assignments a WHERE a.professor_id=u.id AND group_id=$1 AND subject_id=$2) assigned FROM users u WHERE role='professor' AND NOT is_demo ORDER BY name",
            [g, s],
          )
        ).rows
      : [];
  const fields = (
    <>
      <label>
        Title
        <input name="title" required minLength={3} maxLength={120} />
      </label>
      <label>
        Instructions
        <textarea name="instructions" required minLength={5} maxLength={2000} />
      </label>
      <label>
        Deadline (UTC)
        <input type="datetime-local" name="deadline" required />
      </label>
    </>
  );
  return (
    <main className="exam-page">
      {navigation}
      <h1>Teaching workspace</h1>
      <details>
        <summary>Classes and subjects</summary>
        {allowed.map((v) => (
          <p key={v.group_id + v.subject_id}>
            <Link
              href={
                "/professor?group=" +
                encodeURIComponent(v.group_id) +
                "&subject=" +
                encodeURIComponent(v.subject_id)
              }
            >
              {v.class_name} · {v.subject}
            </Link>
          </p>
        ))}
      </details>
      <p role="status">{args.message}</p>
      <section className="panel">
        <h2>
          {scope.subject} · {scope.class_name}
        </h2>
        <p>
          {stats.active} of {stats.students} students practised this subject in
          the past seven days.
        </p>
        <p>
          {stats.active >= 3 && stats.accuracy !== null
            ? `Recent practice accuracy · ${stats.accuracy}%`
            : "Accuracy appears after three students practise."}
        </p>
      </section>
      {u.role === "admin" && (
        <details className="panel">
          <summary>Manage teaching assignments</summary>
          {!professors.length && <p>Provision a professor account first.</p>}
          {professors.map((p) => (
            <form
              key={p.id}
              action={action.bind(null, p.assigned ? "remove" : "assign")}
            >
              <input type="hidden" name="professor" value={p.id} />
              {p.name}{" "}
              <button className="secondary">
                {p.assigned ? "Remove assignment" : "Assign"}
              </button>
            </form>
          ))}
        </details>
      )}
      <details className="panel">
        <summary>Create task or announcement</summary>
        <form action={action.bind(null, "task")}>
          {fields}
          <label>
            Type
            <select name="type">
              {[
                "HOMEWORK",
                "PRINT",
                "BRING",
                "EXAM",
                "QUIZ",
                "ANNOUNCEMENT",
                "CLASS_PREPARATION",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <button className="primary">Create class task</button>
        </form>
      </details>
      <details className="panel">
        <summary>Create verified challenge</summary>
        <form action={action.bind(null, "challenge")}>
          {fields}
          <label>
            Verification
            <select name="question">
              <option value="">Review written work manually</option>
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.prompt}
                </option>
              ))}
            </select>
          </label>
          <label>
            XP reward (200 XP per class and subject per seven days)
            <input
              type="number"
              name="xp"
              defaultValue={10}
              min={0}
              max={100}
              required
            />
          </label>
          <label>
            <input type="checkbox" name="academic" /> Include one academic
            reward after verification
          </label>
          <button className="primary">Publish challenge</button>
        </form>
      </details>
      <section className="panel">
        <h2>Participation</h2>
        {!challenges.length && <p>No challenges yet.</p>}
        {challenges.map((c) => (
          <p key={c.id}>
            <strong>{c.title}</strong> · {c.pending} pending · {c.verified}{" "}
            verified · {c.rejected} rejected
          </p>
        ))}
      </section>
      {queue.length > 0 && (
        <section className="panel">
          <h2>Written work to review</h2>
          {queue.map((r) => (
            <form action={action.bind(null, "review")} key={r.id + r.student}>
              <h3>
                {r.title} · {r.name}
              </h3>
              <p>{r.response}</p>
              <input type="hidden" name="challenge" value={r.id} />
              <input type="hidden" name="student" value={r.student} />
              <label>
                Review note (required for rejection)
                <input name="note" maxLength={500} />
              </label>
              <button className="primary" name="decision" value="approve">
                Verify
              </button>
              <button className="secondary" name="decision" value="reject">
                Reject
              </button>
            </form>
          ))}
        </section>
      )}
    </main>
  );
}
