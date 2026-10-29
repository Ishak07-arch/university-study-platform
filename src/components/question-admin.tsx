"use client";
import { useEffect, useState } from "react";
import type { ContentCatalog } from "@/lib/content-types";
import type { Question } from "@/lib/types";
import type { QuestionType } from "@/lib/exercise-types";
import { exerciseRequest } from "./exercise-entry";
type AdminQuestion = Question & { resource_id: string | null };
export function QuestionAdmin({
  subjects,
}: {
  subjects: { id: string; name: string }[];
}) {
  const [catalog, setCatalog] = useState<ContentCatalog | null>(null),
    [subject, setSubject] = useState(subjects[0]?.id || ""),
    [lesson, setLesson] = useState(""),
    [questions, setQuestions] = useState<AdminQuestion[]>([]),
    [editing, setEditing] = useState<AdminQuestion | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    fetch("/api/content")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (active) setCatalog(data);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setQuestions([]);
    setEditing(null);
    if (lesson)
      fetch("/api/exercises?lesson=" + encodeURIComponent(lesson))
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          if (active) setQuestions(data.questions);
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
    return () => {
      active = false;
    };
  }, [lesson, revision]);
  const chapters =
    catalog?.chapters.filter((c) => c.subject_id === subject) || [];
  const lessons =
    catalog?.lessons.filter((l) =>
      chapters.some((c) => c.id === l.chapter_id),
    ) || [];
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setRevision((v) => v + 1);
      setEditing(null);
      setMessage("Saved. Previous attempts and reward records are preserved.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <h2>Practice questions</h2>
        <p className="helper">
          Create a manual question or review generated practice. Changes apply
          to new attempts. Deleting a question withdraws it while keeping its
          history.
        </p>
        <div className="form-row">
          <label className="field-label">
            Subject
            <select
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setLesson("");
              }}
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Lesson
            <select value={lesson} onChange={(e) => setLesson(e.target.value)}>
              <option value="">Choose a lesson</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {chapters.find((c) => c.id === l.chapter_id)?.title} —{" "}
                  {l.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      {message && (
        <p role="status" className="admin-message">
          {message}
        </p>
      )}
      {lesson && (
        <div className="admin-columns">
          <QuestionForm
            key={`${lesson}:${editing?.id || "new"}:${revision}`}
            question={editing}
            resources={
              catalog?.resources.filter(
                (r) =>
                  r.lesson_id === lesson &&
                  r.published &&
                  !r.archived &&
                  r.ingestion_status === "ready",
              ) || []
            }
            busy={busy}
            cancel={() => setEditing(null)}
            save={(fields) =>
              run(() =>
                exerciseRequest({
                  action: "save",
                  question: { ...fields, lessonId: lesson, id: editing?.id },
                }),
              )
            }
          />
          <section className="panel">
            <h2>Saved questions</h2>
            {questions.length === 0 && (
              <p className="helper">
                No questions yet. Create one here, or generate from published
                material in the lesson.
              </p>
            )}
            {questions.map((q) => (
              <article className="managed-question" key={q.id}>
                <span className="tag">
                  {q.origin} · {q.question_type} · Difficulty {q.difficulty}
                  {q.disabled ? " · Withdrawn" : ""}
                </span>
                <h3>{q.prompt}</h3>
                <details>
                  <summary>Answer and explanation</summary>
                  {q.options.length > 0 && (
                    <ol>
                      {q.options.map((o, i) => (
                        <li key={i}>{o}</li>
                      ))}
                    </ol>
                  )}
                  <p>
                    Expected:{" "}
                    {q.question_type === "numeric"
                      ? `${q.expected?.value} (±${q.expected?.tolerance || 0})`
                      : q.question_type === "text"
                        ? q.expected?.aliases?.join(" / ")
                        : q.options[q.answer]}
                  </p>
                  <p>{q.explanation}</p>
                  {q.resource_id && (
                    <a href={`/api/content/${q.resource_id}`}>
                      Source resource
                    </a>
                  )}
                  <small className="helper">Question ID: {q.id}</small>
                </details>
                {!q.disabled && q.origin !== "seed" && (
                  <div className="resource-actions">
                    {q.origin === "manual" && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => setEditing(q)}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          exerciseRequest({ action: "disable", id: q.id }),
                        )
                      }
                    >
                      {q.origin === "manual"
                        ? "Delete question"
                        : "Disable question"}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
function QuestionForm({
  question,
  resources,
  busy,
  save,
  cancel,
}: {
  question: AdminQuestion | null;
  resources: ContentCatalog["resources"];
  busy: boolean;
  save: (v: Record<string, unknown>) => Promise<void>;
  cancel: () => void;
}) {
  const [type, setType] = useState<QuestionType>(
    question?.question_type || "choice",
  );
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          text = (key: string) => String(f.get(key) || "");
        void save({
          type,
          difficulty: Number(f.get("difficulty")),
          topic: text("topic"),
          prompt: text("prompt"),
          options:
            type === "choice"
              ? text("options")
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
          answer: type === "choice" ? Number(f.get("answer")) - 1 : 0,
          expected:
            type === "numeric"
              ? {
                  value: Number(f.get("value")),
                  tolerance: Number(f.get("tolerance")),
                }
              : type === "text"
                ? {
                    aliases: text("aliases")
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }
                : {},
          explanation: text("explanation"),
          mistake: text("mistake"),
          resourceId: text("resourceId") || undefined,
        });
      }}
    >
      <h2>{question ? "Edit manual question" : "Create manual question"}</h2>
      <div className="form-row">
        <label className="field-label">
          Question type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as QuestionType)}
          >
            <option value="choice">Multiple choice</option>
            <option value="numeric">Numeric answer</option>
            <option value="text">Short text answer</option>
          </select>
        </label>
        <label className="field-label">
          Difficulty
          <select name="difficulty" defaultValue={question?.difficulty || 1}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field-label">
        Topic / learning objective
        <input
          name="topic"
          required
          minLength={2}
          maxLength={120}
          defaultValue={question?.topic}
        />
      </label>
      <label className="field-label">
        Prompt
        <textarea
          name="prompt"
          required
          minLength={8}
          maxLength={2000}
          rows={3}
          defaultValue={question?.prompt}
        />
      </label>
      {type === "choice" ? (
        <>
          <label className="field-label">
            Options (one per line, 2–6)
            <textarea
              name="options"
              required
              rows={4}
              defaultValue={question?.options.join("\n")}
            />
          </label>
          <label className="field-label">
            Correct option number
            <input
              name="answer"
              type="number"
              min={1}
              max={6}
              required
              defaultValue={(question?.answer || 0) + 1}
            />
          </label>
        </>
      ) : type === "numeric" ? (
        <div className="form-row">
          <label className="field-label">
            Expected number
            <input
              name="value"
              type="number"
              step="any"
              required
              defaultValue={question?.expected?.value}
            />
          </label>
          <label className="field-label">
            Absolute tolerance
            <input
              name="tolerance"
              type="number"
              step="any"
              min={0}
              max={1000}
              required
              defaultValue={question?.expected?.tolerance ?? 0.001}
            />
          </label>
        </div>
      ) : (
        <label className="field-label">
          Accepted answers (one per line)
          <textarea
            name="aliases"
            required
            rows={3}
            defaultValue={question?.expected?.aliases?.join("\n")}
          />
          <small className="helper">
            Exact words after case and whitespace normalisation. Add legitimate
            alternatives explicitly.
          </small>
        </label>
      )}
      <label className="field-label">
        Explanation
        <textarea
          name="explanation"
          minLength={5}
          maxLength={2000}
          required
          rows={3}
          defaultValue={question?.explanation}
        />
      </label>
      <label className="field-label">
        Short retry hint
        <input
          name="mistake"
          minLength={5}
          maxLength={200}
          required
          defaultValue={question?.mistake}
        />
      </label>
      <label className="field-label">
        Source resource
        <select name="resourceId" defaultValue={question?.resource_id || ""}>
          <option value="">Manual question — no uploaded source</option>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : "Save question"}
      </button>
      {question && (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={cancel}
        >
          Cancel edit
        </button>
      )}
    </form>
  );
}
