"use client";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "./ui";
import type {
  CourseResource,
  TutorContext,
  TutorReply,
} from "@/lib/content-types";
export function LessonResources({
  lessonId,
  demo = false,
}: {
  lessonId: string;
  demo?: boolean;
}) {
  const [resources, setResources] = useState<CourseResource[]>([]),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    fetch("/api/content?lesson=" + encodeURIComponent(lessonId), {
      signal: controller.signal,
    })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setResources(d.resources);
        setLoaded(true);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [lessonId, demo]);
  if (demo)
    return (
      <p className="helper">
        Sign in with a student account to access your class materials and Tutor.
      </p>
    );
  return (
    <section className="lesson-resources">
      <h4>Course materials</h4>
      {error ? (
        <p role="alert">{error}</p>
      ) : !loaded ? (
        <p role="status">Loading materials…</p>
      ) : !resources.length ? (
        <p className="helper">No published materials for this lesson yet.</p>
      ) : (
        resources.map((r) => (
          <a key={r.id} className="resource-link" href={"/api/content/" + r.id}>
            <strong>{r.title}</strong>
            <span>
              {r.kind
                .replace("NOTE", "Course note")
                .replace("EXERCISE", "Exercise sheet")
                .replace("EXAM", "Previous exam")}{" "}
              · {Math.ceil(r.byte_size / 1024)} KB · Download
            </span>
          </a>
        ))
      )}
      <TutorButton context={{ lessonId }} />
    </section>
  );
}
export function TutorButton({ context }: { context: TutorContext }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="text-button tutor-trigger"
        onClick={() => setOpen(true)}
      >
        <Sparkles size={16} />
        Ask Tutor
      </button>
      {open && (
        <TutorDialog
          key={context.sessionId || context.lessonId}
          context={context}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}
function TutorDialog({
  context,
  close,
}: {
  context: TutorContext;
  close: () => void;
}) {
  const [message, setMessage] = useState(""),
    [reply, setReply] = useState<TutorReply | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function ask() {
    setBusy(true);
    setReply(null);
    setError("");
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...context, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReply(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="A little help from your Tutor" onClose={close}>
      <div className="tutor-body">
        <p className="helper">
          Uses published materials for this lesson. Your question and relevant
          excerpts are sent to the AI provider; avoid personal information. No
          conversation history is saved by Folio.
        </p>
        <div className="tutor-suggestions">
          {[
            "Explain this simply",
            "Why is my answer wrong?",
            "Give me another example",
            "Explain this formula",
          ]
            .filter((x) => context.sessionId || x !== "Why is my answer wrong?")
            .map((text) => (
              <button
                key={text}
                className="secondary"
                disabled={busy}
                onClick={() => setMessage(text)}
              >
                {text}
              </button>
            ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <label className="field-label">
            Your question
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={3}
              maxLength={1200}
              rows={3}
              placeholder="What would you like to understand?"
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Looking through your material…" : "Ask Tutor"}
          </button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {reply && (
          <section className="tutor-answer" aria-live="polite">
            <p className="helper">{reply.message}</p>
            {reply.paragraphs.map((p, i) => (
              <div key={i}>
                <p>{p.text}</p>
                {p.sources.map((s, j) => (
                  <details key={s.id + j}>
                    <summary>{s.label}</summary>
                    <blockquote>{s.quote}</blockquote>
                    <a href={"/api/content/" + s.resourceId}>
                      {s.title} — Download source
                    </a>
                  </details>
                ))}
              </div>
            ))}
          </section>
        )}
      </div>
    </Modal>
  );
}
