import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { prepHome, solution } from "@/server/exam-prep";
import { begin, reviewCard } from "../actions";
import { examOutlook } from "@/server/study-plan";
import { LessonPractice } from "@/components/exercise-entry";
export default async function Prep({
  params,
  searchParams,
}: {
  params: Promise<{ subject: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  const { subject } = await params,
    db = await getDb(),
    { topics, card, due, active } = await prepHome(db, u, subject);
  const name = (
    await db.query<{ name: string }>("SELECT name FROM subjects WHERE id=$1", [
      subject,
    ])
  ).rows[0].name;
  const recommendation = topics[0];
  const outlook = await examOutlook(db, u, subject);
  return (
    <main className="exam-page">
      <Link href={"/study/" + subject}>← Subject</Link>
      <h1>Exam prep · {name}</h1>
      <section className="panel">
        <h2>Study-readiness estimate</h2>
        {outlook.days !== null && (
          <p>
            {outlook.title} ·{" "}
            {outlook.days === 0 ? "Today" : outlook.days + " days remaining"}
          </p>
        )}
        <strong>
          {outlook.score === null
            ? "More practice needed"
            : outlook.score + "%"}
        </strong>
        <p>
          Based on topic coverage, recent answers, recurring mistakes and
          completed mocks. Actual exam results can differ.
        </p>
        {!!outlook.strong.length && <p>Strong · {outlook.strong.join(", ")}</p>}
        {!!outlook.review.length && (
          <p>Before the exam · {outlook.review.join(", ")}</p>
        )}
      </section>
      <section className="panel">
        <h2>Recommended today</h2>
        {recommendation ? (
          <>
            <strong>{recommendation.topic}</strong>
            <p>
              {recommendation.weak
                ? "Revisit a previous mistake."
                : recommendation.practised
                  ? "Refresh this topic."
                  : "Start with an unpractised topic."}
            </p>
            {!u.is_demo && (
              <LessonPractice lessonId={recommendation.lesson_id} />
            )}
            <small>
              Practice coverage · {topics.filter((t) => t.practised).length} of{" "}
              {topics.length} lesson topics attempted
            </small>
          </>
        ) : (
          <p>Your question pool is empty.</p>
        )}
      </section>
      <section className="panel">
        <h2>Timed mock exam</h2>
        {active ? (
          <Link className="primary" href={"/mock/" + active.id}>
            Resume exam
          </Link>
        ) : (
          <form action={begin.bind(null, subject)}>
            <label>
              Questions{" "}
              <select name="count" defaultValue="10">
                {[5, 10, 20].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Minutes{" "}
              <select name="minutes" defaultValue="30">
                {[10, 30, 60].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <p>
              Smaller pools use every available question. Answers are marked at
              the end.
            </p>
            <button className="primary">Start mock exam</button>
          </form>
        )}
        <p role="status">{(await searchParams).message}</p>
      </section>
      <section className="panel" id="cards">
        <h2>Flashcards · {due} due</h2>
        {card ? (
          <article key={card.id}>
            <small>{card.topic}</small>
            <h3>{card.prompt}</h3>
            {card.question_type === "choice" && (
              <ul>
                {card.options.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            )}
            <details>
              <summary>Show answer</summary>
              <p>
                <strong>{solution(card)}</strong>
              </p>
              <p>{card.explanation}</p>
              <form action={reviewCard.bind(null, subject, card.id)}>
                {["Again", "Hard", "Good"].map((r) => (
                  <button className="secondary" name="rating" value={r} key={r}>
                    {r}
                  </button>
                ))}
              </form>
            </details>
          </article>
        ) : (
          <p>All caught up.</p>
        )}
      </section>
    </main>
  );
}
