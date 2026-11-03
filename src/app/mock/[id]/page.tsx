import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser, HttpError } from "@/server/auth";
import { getDb } from "@/server/db";
import { examData, solution } from "@/server/exam-prep";
import { questionSource } from "@/server/questions";
import { MockClock } from "@/components/mock-clock";
import { LessonPractice } from "@/components/exercise-entry";
import { respond } from "../../prep/actions";
export default async function Mock({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ n?: string; message?: string }>;
}) {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  if (u.role === "professor") redirect("/professor");
  const { id } = await params,
    db = await getDb(),
    { exam, items } = await examData(db, u, id).catch((e) => {
      if (e instanceof HttpError) notFound();
      throw e;
    });
  const home = "/prep/" + exam.subject_id;
  if (exam.submitted_at) {
    const missed = items.filter((q) => !q.correct),
      weak = new Set(missed.map((q) => q.topic)),
      strong = new Set(
        items
          .filter((q) => q.correct && !weak.has(q.topic))
          .map((q) => q.topic),
      );
    return (
      <main className="exam-page">
        <h1>Mock exam complete</h1>
        <section className="panel">
          <h2>
            {exam.graded_count
              ? Math.round((100 * exam.correct_count) / exam.graded_count) + "%"
              : "No scorable questions"}
          </h2>
          <p>
            {exam.correct_count} of {exam.graded_count} correct
          </p>
          <p>Strong · {[...strong].join(", ") || "No topics yet"}</p>
          <p>Needs review · {[...weak].join(", ") || "None"}</p>
          <a href="#review">Review answers</a>
          {missed[0] && !u.is_demo && (
            <LessonPractice lessonId={missed[0].lesson_id} />
          )}
        </section>
        <Link href={home}>Try another exam</Link>
        <section id="review">
          <h2>Answer review</h2>
          {await Promise.all(
            items.map(async (q) => {
              const source = await questionSource(db, q);
              return (
                <article className="panel" key={q.id}>
                  <small>
                    {q.correct ? "Correct" : "Needs review"} · {q.topic}
                  </small>
                  <h3>{q.prompt}</h3>
                  <p>
                    Your answer ·{" "}
                    {q.response === null
                      ? "Unanswered"
                      : q.question_type === "choice"
                        ? q.options[Number(q.response)]
                        : q.response}
                  </p>
                  <strong>Correct answer · {solution(q)}</strong>
                  <p>{q.explanation}</p>
                  {q.correct === false &&
                    q.response !== null &&
                    q.occurrences > 1 && (
                      <p>
                        You have missed this question {q.occurrences} times.
                      </p>
                    )}
                  {source && (
                    <Link href={"/api/content/" + source.resourceId}>
                      {source.label}
                    </Link>
                  )}
                </article>
              );
            }),
          )}
        </section>
      </main>
    );
  }
  const args = await searchParams,
    n = Math.max(
      0,
      Math.min(items.length - 1, parseInt(args.n || "0", 10) || 0),
    ),
    q = items[n],
    choice = q?.question_type === "choice";
  return (
    <main className="exam-page">
      <Link href={home}>← Exam prep</Link>
      <MockClock deadline={new Date(exam.deadline).getTime()} />
      <h1>Mock exam</h1>
      <p>
        {items.filter((x) => x.response !== null).length} of {items.length}{" "}
        answers saved
      </p>
      <form
        className="panel"
        key={q?.id}
        id="exam-answer"
        action={respond.bind(null, id, q?.id || null, choice, n)}
      >
        {q ? (
          <>
            <small>
              Question {n + 1} of {items.length}
            </small>
            <h2>{q.prompt}</h2>
            {choice ? (
              q.options.map((o, i) => (
                <label key={i}>
                  <input
                    type="radio"
                    name="answer"
                    value={i}
                    defaultChecked={q.response === i}
                  />{" "}
                  {o}
                </label>
              ))
            ) : (
              <label>
                Your answer
                <input
                  name="answer"
                  maxLength={500}
                  defaultValue={q.response ?? ""}
                />
              </label>
            )}
          </>
        ) : (
          <p>Questions have been withdrawn.</p>
        )}
        <p role="status">{args.message}</p>
        {n > 0 && (
          <button name="move" value="back" className="secondary">
            Save &amp; back
          </button>
        )}
        {q && (
          <button className="primary" name="move" value="next">
            {n === items.length - 1 ? "Save answer" : "Save & next"}
          </button>
        )}
        <button className="secondary" name="move" value="finish">
          Submit exam
        </button>
      </form>
    </main>
  );
}
