"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Check, Plus, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { Subject } from "@/lib/types";
import { CourseContent } from "./course-content";
import { QuestionAdmin } from "./question-admin";
type Named = { id: string; name: string };
export function AdminDashboard({
  name,
  pending,
  subjects,
  groups,
  semesters,
  tasks,
  events,
}: {
  name: string;
  pending: { email: string; name: string }[];
  subjects: Subject[];
  groups: Named[];
  semesters: Named[];
  tasks: {
    id: string;
    title: string;
    type: string;
    group_name: string;
    due_at: string;
  }[];
  events: {
    id: string;
    name: string;
    amount: number;
    reason: string;
    created_at: string;
  }[];
}) {
  const [tab, setTab] = useState("tasks");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>, action: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    const payload: Record<string, unknown> = { ...fields };
    if (fields.due_at)
      payload.due_at = new Date(String(fields.due_at)).toISOString();
    if (fields.importance) payload.importance = Number(fields.importance);
    setBusy(true);
    setMessage("");
    try {
      await api(action, payload);
      setMessage(
        action === "approve-enrolment"
          ? "Class membership approved."
          : "Saved. Students can see this in their workspace now.",
      );
      form.reset();
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-page">
      <header className="session-header">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <BookOpen size={24} />
          </span>
          folio.
        </Link>
        <span className="tag green">
          <ShieldCheck size={16} />
          Admin workspace
        </span>
        <Link href="/" className="back-link">
          <ArrowLeft size={16} />
          Student view
        </Link>
      </header>
      <main className="admin-main">
        <Link className="secondary" href="/professor">
          Teaching assignments and challenges
        </Link>
        <div className="page-heading">
          <div>
            <span className="eyebrow">A LITTLE SUPPORT GOES A LONG WAY</span>
            <h1>Welcome, {name.split(" ")[0]}.</h1>
            <p>Keep your students’ next steps clear.</p>
          </div>
        </div>
        <div className="admin-tabs segmented">
          {[
            ["tasks", "Reminders"],
            ["enrolment", "Class approvals"],
            ["subjects", "Subjects"],
            ["lessons", "Lessons"],
            ["content", "Course materials"],
            ["questions", "Questions"],
            ["audit", "XP activity"],
          ].map(([key, title]) => (
            <button
              key={key}
              className={key === tab ? "selected" : ""}
              onClick={() => {
                setTab(key);
                setMessage("");
              }}
            >
              {title}
            </button>
          ))}
        </div>
        {message && (
          <div className="admin-message" role="status">
            {message}
          </div>
        )}
        {tab === "enrolment" ? (
          <form
            className="panel"
            onSubmit={(e) => submit(e, "approve-enrolment")}
          >
            <h2>Approve class membership</h2>
            <p>
              Confirm the account holder’s identity and class against your
              roster. Registration emails are self-reported.
            </p>
            <label className="field-label">
              Pending account email
              <input
                type="email"
                name="studentEmail"
                list="pending-students"
                required
              />
              <datalist id="pending-students">
                {pending.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.name}
                  </option>
                ))}
              </datalist>
            </label>
            <label className="field-label">
              Verified class
              <select name="group_id" defaultValue="" required>
                <option value="" disabled>
                  Choose a class
                </option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={busy}>
              Approve membership
            </button>
          </form>
        ) : tab === "tasks" ? (
          <div className="admin-columns">
            <form className="panel" onSubmit={(e) => submit(e, "admin-task")}>
              <h2>Create a reminder</h2>
              <label className="field-label">
                Title
                <input
                  name="title"
                  required
                  minLength={3}
                  maxLength={120}
                  placeholder="Print your worksheet before class"
                />
              </label>
              <div className="form-row">
                <label className="field-label">
                  Subject
                  <select name="subject_id">
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Class group
                  <select name="group_id">
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label className="field-label">
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
                <label className="field-label">
                  Due date & time
                  <input name="due_at" type="datetime-local" required />
                </label>
              </div>
              <label className="field-label">
                Importance
                <select name="importance">
                  <option value="1">Normal</option>
                  <option value="2">Important</option>
                  <option value="3">Urgent</option>
                </select>
              </label>
              <label className="field-label">
                Details
                <textarea
                  name="description"
                  rows={3}
                  maxLength={2000}
                  placeholder="What should students know?"
                />
              </label>
              <button disabled={busy} className="primary">
                {busy ? "Saving…" : "Create reminder"}
                <Plus size={17} />
              </button>
            </form>
            <section className="panel">
              <h2>Recent reminders</h2>
              {tasks.map((t) => (
                <div className="admin-item" key={t.id}>
                  <span className="eyebrow">{t.type.replaceAll("_", " ")}</span>
                  <h3>{t.title}</h3>
                  <p>{t.group_name}</p>
                  <small>{new Date(t.due_at).toLocaleString()}</small>
                </div>
              ))}
            </section>
          </div>
        ) : tab === "subjects" ? (
          <div className="admin-columns">
            <form
              className="panel"
              onSubmit={(e) => submit(e, "admin-subject")}
            >
              <h2>Add a subject</h2>
              <label className="field-label">
                Name
                <input name="name" required minLength={2} maxLength={100} />
              </label>
              <label className="field-label">
                Course code
                <input
                  name="code"
                  required
                  minLength={2}
                  maxLength={20}
                  placeholder="ECO 201"
                />
              </label>
              <label className="field-label">
                Semester
                <select name="semester_id">
                  {semesters.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Description
                <textarea
                  name="description"
                  required
                  minLength={3}
                  maxLength={500}
                  rows={3}
                />
              </label>
              <button className="primary" disabled={busy}>
                Add subject
                <Plus size={17} />
              </button>
            </form>
            <section className="panel">
              <h2>Your curriculum</h2>
              {subjects.map((s) => (
                <div className="admin-item" key={s.id}>
                  <span className="eyebrow">{s.code}</span>
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                </div>
              ))}
            </section>
          </div>
        ) : tab === "questions" ? (
          <QuestionAdmin subjects={subjects} />
        ) : tab === "content" ? (
          <CourseContent subjects={subjects} />
        ) : tab === "lessons" ? (
          <form
            className="panel lesson-editor"
            onSubmit={(e) => submit(e, "admin-lesson")}
          >
            <h2>Publish a lesson</h2>
            <label className="field-label">
              Subject
              <select name="subject_id">
                {subjects.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Chapter title
              <input name="chapter" required minLength={3} maxLength={150} />
            </label>
            <label className="field-label">
              Lesson title
              <input name="title" required minLength={3} maxLength={150} />
            </label>
            <label className="field-label">
              Lesson content
              <textarea
                name="body"
                required
                minLength={20}
                maxLength={12000}
                rows={12}
                placeholder="Explain the concept in clear, approachable language…"
              />
            </label>
            <button className="primary" disabled={busy}>
              Publish lesson
              <Check size={17} />
            </button>
          </form>
        ) : (
          <section className="panel">
            <h2>Learning points audit</h2>
            <p className="helper">
              Server-validated awards for real student accounts. Demo activity
              is excluded.
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Reason</th>
                    <th>XP</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td>{e.name}</td>
                      <td>{e.reason}</td>
                      <td>+{e.amount}</td>
                      <td>{new Date(e.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!events.length && (
              <p className="empty-inline">
                Student learning activity will appear here.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
