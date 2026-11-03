import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { studentChallenges } from "@/server/teaching-data";
import { studentAction } from "../professor/actions";
export default async function Challenges({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  if (u.role !== "student" || u.is_demo) notFound();
  const rows = await studentChallenges(await getDb(), u);
  return (
    <main className="exam-page">
      <Link href="/tasks">← Tasks</Link>
      <h1>Professor challenges</h1>
      <p role="status">{(await searchParams).message}</p>
      {!rows.length && <p>No challenges for your class yet.</p>}
      {rows.map((c) => (
        <section key={c.id} className="panel">
          <small>
            {c.subject} · Due{" "}
            {new Date(c.due_at).toLocaleString("en-GB", {
              timeZone: u.timezone,
            })}
          </small>
          <h2>{c.title}</h2>
          <p>{c.instructions}</p>
          <p>
            {c.xp_reward} XP
            {c.academic ? " · Verified academic reward available" : ""}
          </p>
          {c.status ? (
            <>
              <strong>Submission · {c.status}</strong>
              {c.status === "verified" && c.academic && (
                <p>1 verified academic reward earned</p>
              )}
              <p>{c.note}</p>
            </>
          ) : (
            <form action={studentAction.bind(null, c.id)}>
              {!c.question_id && (
                <label>
                  Your work
                  <textarea
                    required
                    minLength={5}
                    maxLength={3000}
                    name="response"
                  />
                </label>
              )}
              <button className="primary">
                {c.question_id ? "Start exercise" : "Submit for review"}
              </button>
            </form>
          )}
        </section>
      ))}
    </main>
  );
}
