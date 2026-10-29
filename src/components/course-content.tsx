"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./ui";
import type { ContentCatalog, CourseResource } from "@/lib/content-types";
async function request(body: Record<string, unknown> | FormData) {
  const res = await fetch("/api/content", {
    method: "POST",
    headers:
      body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}
export function CourseContent({
  subjects,
}: {
  subjects: { id: string; name: string }[];
}) {
  const [data, setData] = useState<ContentCatalog | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<CourseResource | null>(null);
  const router = useRouter();
  async function refresh() {
    const res = await fetch("/api/content");
    const d = await res.json();
    if (!res.ok) throw new Error(d.error);
    setData(d);
  }
  useEffect(() => {
    refresh().catch((e) => setMessage(e.message));
  }, []);
  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await refresh();
      router.refresh();
      setMessage(success);
    } catch (e) {
      setMessage((e as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  function submit(e: React.FormEvent<HTMLFormElement>, action: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    void run(async () => {
      await request({ action, ...fields });
      form.reset();
    }, "Saved to the curriculum.");
  }
  return (
    <section className="content-workspace">
      <p className="helper">
        Upload → extract text → review → publish. Only published materials are
        available to students and the Tutor.
      </p>
      {message && (
        <p className="admin-message" role="status">
          {message}
        </p>
      )}
      {!data ? (
        <p role="status">
          {message ? "Could not load materials." : "Loading materials…"}
        </p>
      ) : (
        <>
          <div className="admin-columns">
            <form
              className="panel"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fields = new FormData(form);
                const note = String(fields.get("note") || "").trim();
                fields.delete("note");
                if (note)
                  fields.set(
                    "file",
                    new File([note], "course-note.txt", { type: "text/plain" }),
                  );
                void run(async () => {
                  const { id } = await request(fields);
                  setMessage("Uploaded as a draft. Extracting readable text…");
                  await request({ action: "process", id });
                  form.reset();
                }, "Text extracted. Review your resource below, then publish it.");
              }}
            >
              <h2>Add course material</h2>
              <LessonPicker data={data} subjects={subjects} />
              <label className="field-label">
                Resource title
                <input name="title" required minLength={3} maxLength={150} />
              </label>
              <label className="field-label">
                Resource type
                <select name="kind" defaultValue="NOTE">
                  <option value="NOTE">Text / note</option>
                  <option value="PDF">PDF</option>
                  <option value="EXERCISE">Exercise sheet</option>
                  <option value="EXAM">Previous exam</option>
                </select>
              </label>
              <label className="field-label">
                PDF or text file
                <input
                  name="file"
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                />
              </label>
              <label className="field-label">
                Or paste a course note
                <textarea
                  name="note"
                  rows={5}
                  maxLength={100000}
                  placeholder="Pasted text is used instead of a selected file."
                />
              </label>
              <p className="helper">
                Up to 5 MB. Text-based PDFs (150 pages maximum) or UTF-8 text.
                Scans need OCR first.
              </p>
              <button
                className="primary"
                disabled={busy || !data.lessons.length}
              >
                {busy ? "Working…" : "Upload and extract"}
              </button>
            </form>
            <div className="content-structure">
              <form className="panel" onSubmit={(e) => submit(e, "chapter")}>
                <h2>Create a chapter</h2>
                <label className="field-label">
                  Subject
                  <select name="subjectId">
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Chapter title
                  <input name="title" minLength={3} maxLength={150} required />
                </label>
                <button className="secondary" disabled={busy}>
                  Create chapter
                </button>
              </form>
              <form className="panel" onSubmit={(e) => submit(e, "lesson")}>
                <h2>Create a lesson</h2>
                <label className="field-label">
                  Chapter
                  <select name="chapterId" required>
                    {data.chapters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {subjects.find((s) => s.id === c.subject_id)?.name} —{" "}
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Lesson title
                  <input name="title" minLength={3} maxLength={150} required />
                </label>
                <label className="field-label">
                  Lesson content
                  <textarea
                    name="body"
                    required
                    minLength={20}
                    maxLength={12000}
                    rows={4}
                  />
                </label>
                <p className="helper">
                  Lesson text is visible immediately. Uploaded resources remain
                  drafts until published.
                </p>
                <button
                  className="secondary"
                  disabled={busy || !data.chapters.length}
                >
                  Create lesson
                </button>
              </form>
            </div>
          </div>
          <section className="panel">
            <h2>Manage resources</h2>
            {!data.resources.length && (
              <p className="empty-inline">
                Your uploaded materials will appear here.
              </p>
            )}
            {data.resources.map((r) => (
              <article className="admin-item" key={r.id}>
                <span className="tag">
                  {r.archived
                    ? "Archived"
                    : r.published
                      ? "Published"
                      : "Draft"}{" "}
                  · {r.ingestion_status}
                </span>
                <h3>{r.title}</h3>
                <p>
                  {data.lessons.find((l) => l.id === r.lesson_id)?.title} ·{" "}
                  {r.filename} · {Math.ceil(r.byte_size / 1024)} KB
                  {r.page_count ? ` · ${r.page_count} pages` : ""}
                </p>
                {r.ingestion_error && (
                  <p className="form-error">{r.ingestion_error}</p>
                )}
                <div className="content-actions">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setEditing(r)}
                  >
                    Manage
                  </button>
                  {!r.archived && (
                    <>
                      <a className="text-button" href={"/api/content/" + r.id}>
                        Download original
                      </a>
                      {!r.published && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => request({ action: "process", id: r.id }),
                              "Text extracted. Ready to publish.",
                            )
                          }
                        >
                          Retry extraction
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </section>
          {editing && (
            <Modal
              title={`Manage ${editing.title}`}
              onClose={() => setEditing(null)}
            >
              <form
                className="resource-editor"
                key={editing.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await request({
                      action: "update",
                      id: editing.id,
                      title: f.get("title"),
                      lessonId: f.get("lessonId"),
                      published: f.get("published") === "on",
                      archived: f.get("archived") === "on",
                    });
                    setEditing(null);
                  }, "Resource updated.");
                }}
              >
                <label className="field-label">
                  Title
                  <input
                    name="title"
                    defaultValue={editing.title}
                    required
                    minLength={3}
                    maxLength={150}
                  />
                </label>
                <LessonPicker
                  data={data}
                  subjects={subjects}
                  initial={editing.lesson_id}
                />
                <label className="content-check">
                  <input
                    type="checkbox"
                    name="published"
                    defaultChecked={editing.published}
                    disabled={editing.ingestion_status !== "ready"}
                  />
                  Published for students
                </label>
                <label className="content-check">
                  <input
                    type="checkbox"
                    name="archived"
                    defaultChecked={editing.archived}
                  />
                  Archived (uncheck Published first)
                </label>
                <p className="helper">
                  Download and review the original before publishing. To replace
                  a file, archive it and upload the corrected version.
                </p>
                <div className="content-actions">
                  <button className="primary" disabled={busy}>
                    Save resource
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </Modal>
          )}
        </>
      )}
    </section>
  );
}
function LessonPicker({
  data,
  subjects,
  initial,
}: {
  data: ContentCatalog;
  subjects: { id: string; name: string }[];
  initial?: string;
}) {
  const initialLesson = data.lessons.find((l) => l.id === initial),
    initialChapter = data.chapters.find(
      (c) => c.id === initialLesson?.chapter_id,
    );
  const [subject, setSubject] = useState(
      initialChapter?.subject_id || subjects[0]?.id || "",
    ),
    [chapter, setChapter] = useState(initialChapter?.id || ""),
    [lesson, setLesson] = useState(initial || "");
  const chapters = data.chapters.filter((c) => c.subject_id === subject),
    chapterId = chapters.some((c) => c.id === chapter)
      ? chapter
      : chapters[0]?.id || "";
  const lessons = data.lessons.filter((l) => l.chapter_id === chapterId),
    lessonId = lessons.some((l) => l.id === lesson)
      ? lesson
      : lessons[0]?.id || "";
  return (
    <>
      <label className="field-label">
        Subject
        <select
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setChapter("");
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
        Chapter
        <select
          value={chapterId}
          onChange={(e) => {
            setChapter(e.target.value);
            setLesson("");
          }}
        >
          {!chapters.length && <option value="">Create a chapter first</option>}
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Lesson
        <select
          name="lessonId"
          required
          value={lessonId}
          onChange={(e) => setLesson(e.target.value)}
        >
          {!lessons.length && <option value="">Create a lesson first</option>}
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
