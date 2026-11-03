"use client";
import {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  House,
  BookOpen,
  ChartNoAxesCombined,
  Trophy,
  UserRound,
  Bell,
  Sun,
  Moon,
  ChevronDown,
  ArrowRight,
  ArrowUpRight,
  Flame,
  Zap,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  Backpack,
  X,
  Target,
  Sprout,
  LogOut,
  Settings2,
  GraduationCap,
} from "lucide-react";
import type { Snapshot, Mode, Task, Subject } from "@/lib/types";
import { api } from "@/lib/api";
import { DailyStudy } from "./daily-study";
import { recommendedSubject } from "@/lib/recommendation";
import {
  SubjectIcon,
  ProgressBar,
  Modal,
  SectionHeading,
  StudyIllustration,
} from "./ui";
import {
  StudyPage,
  ProgressPage,
  LeaderboardPage,
  ProfilePage,
  TasksPage,
} from "./pages";
type Context = {
  data: Snapshot;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  choose: (mode: Mode, subject?: string) => void;
  start: (
    mode: Mode,
    subject: string,
    minutes?: number,
    resume?: boolean,
  ) => Promise<void>;
  toggleTask: (task: Task) => Promise<void>;
  openTask: (task: Task) => void;
  busy: boolean;
};
const StudyContext = createContext<Context>(null!);
export const useStudy = () => useContext(StudyContext);
const nav = [
  ["home", "Home", House, "/"],
  ["study", "Study", BookOpen, "/study"],
  ["progress", "Progress", ChartNoAxesCombined, "/progress"],
  ["leaderboard", "Leaderboard", Trophy, "/leaderboard"],
  ["profile", "Profile", UserRound, "/profile"],
] as const;
export function dueLabel(value: string, timezone = "Africa/Lagos") {
  const d = new Date(value);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    new Date(),
  );
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    d,
  );
  const delta = Math.round(
    (new Date(day).getTime() - new Date(today).getTime()) / 86400000,
  );
  return delta < 0
    ? "Overdue"
    : delta === 0
      ? "Today"
      : delta === 1
        ? "Tomorrow"
        : delta < 7
          ? `In ${delta} days`
          : d.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              timeZone: timezone,
            });
}
export function AppShell({
  initial,
  section,
  subjectId,
}: {
  initial: Snapshot;
  section: string;
  subjectId?: string;
}) {
  const [data, setData] = useState(initial);
  const [theme, setTheme] = useState("light");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<{ mode: Mode; subject: string } | null>(
    null,
  );
  const [minutes, setMinutes] = useState(10);
  const [task, setTask] = useState<Task | null>(null);
  const router = useRouter();
  useEffect(() => {
    setData(initial);
  }, [initial]);
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || "light");
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  const refresh = useCallback(async () => {
    const res = await fetch("/api/actions");
    if (res.ok) setData(await res.json());
  }, []);
  async function ensureUser() {
    if (!data.authenticated) {
      await api("demo");
      await refresh();
    }
  }
  async function start(
    mode: Mode,
    subject: string,
    duration = 10,
    resume = false,
  ) {
    setBusy(true);
    try {
      await ensureUser();
      if (resume) {
        const r = await fetch("/api/actions");
        const s: Snapshot = await r.json();
        if (s.active) {
          router.push("/session/" + s.active.id);
          return;
        }
      }
      if (mode === "exam") {
        router.push("/prep/" + encodeURIComponent(subject));
        return;
      }
      const r = await api<{ id: string }>("start", {
        mode,
        subject,
        minutes: duration,
      });
      router.push("/session/" + r.id);
    } catch (e) {
      setNotice((e as Error).message);
      setBusy(false);
    }
  }
  async function toggleTask(t: Task) {
    setBusy(true);
    try {
      await ensureUser();
      await api("task", { id: t.id, completed: !t.completed });
      await refresh();
      setTask((v) => (v?.id === t.id ? { ...v, completed: !t.completed } : v));
      setNotice(
        t.completed
          ? "Task added back to your list."
          : "One less thing to think about. Task complete!",
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const value = {
    data,
    refresh,
    notify: setNotice,
    choose: (mode: Mode, subject?: string) => {
      setMinutes(10);
      setPicker({
        mode,
        subject: subject || data.active?.subject_id || data.subjects[0]?.id,
      });
    },
    start,
    toggleTask,
    openTask: setTask,
    busy,
  };
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("folio-theme", next);
  }
  return (
    <StudyContext.Provider value={value}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-layout">
        <aside className="sidebar">
          <Link className="brand" href="/" aria-label="Folio home">
            <span className="brand-mark">
              <BookOpen size={25} />
            </span>
            folio<span className="brand-dot">.</span>
          </Link>
          <div className="workspace-label">YOUR STUDY SPACE</div>
          <nav aria-label="Main navigation">
            {nav.map(([key, label, Icon, url]) => (
              <Link
                key={key}
                href={url}
                className={`nav-link ${section === key ? "active" : ""}`}
                aria-current={section === key ? "page" : undefined}
              >
                <Icon size={20} strokeWidth={1.8} />
                <span>{label}</span>
                {section === key && <span className="nav-dot" />}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="growth-note">
              <Sprout size={29} strokeWidth={1.5} />
              <strong>
                Small steps.
                <br />
                Big possibilities.
              </strong>
              <p>
                You don’t have to do it all.
                <br />
                Just the next little thing.
              </p>
            </div>
            <button className="theme-control" onClick={toggleTheme}>
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
              <span>
                {theme === "light" ? "Dark appearance" : "Light appearance"}
              </span>
              <span className="theme-switch">
                <i />
              </span>
            </button>
            <Link
              className="sidebar-profile"
              href={data.authenticated ? "/profile" : "/sign-in"}
            >
              <span className="avatar">
                {data.profile.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>
                <strong>{data.profile.name}</strong>
                <small>
                  {data.profile.is_demo
                    ? "Demo student"
                    : "Year 1 · Semester 1"}
                </small>
              </span>
              <ChevronDown size={16} />
            </Link>
          </div>
        </aside>
        <div className="app-body">
          <header className="topbar">
            <span className="breadcrumb">
              Your workspace <span>/</span>{" "}
              <strong>
                {nav.find((n) => n[0] === section)?.[1] || "Tasks"}
              </strong>
            </span>
            <div className="topbar-right">
              <button
                className="icon-button mobile-theme"
                onClick={toggleTheme}
                aria-label={
                  theme === "light"
                    ? "Use dark appearance"
                    : "Use light appearance"
                }
              >
                {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              <span className="semester">
                <span />
                Semester 1
              </span>
              <span className="topbar-line" />
              <Link
                className="icon-button notification-button"
                href="/tasks"
                aria-label="View reminders"
              >
                <Bell size={20} />
                {data.tasks.some((t) => !t.completed) && <i />}
              </Link>
              <Link
                href={data.authenticated ? "/profile" : "/sign-in"}
                className="avatar avatar-small"
                aria-label="Your profile"
              >
                {data.profile.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </Link>
            </div>
          </header>
          <main
            id="main-content"
            className={`main-content ${section === "home" ? "home-page" : ""}`}
          >
            {section === "home" ? (
              <Home />
            ) : section === "study" ? (
              <StudyPage subjectId={subjectId} />
            ) : section === "progress" ? (
              <ProgressPage />
            ) : section === "leaderboard" ? (
              <LeaderboardPage />
            ) : section === "profile" ? (
              <ProfilePage />
            ) : (
              <TasksPage />
            )}
          </main>
          <footer className="page-footer">
            <span>Made for a little progress, every day.</span>
            <span>
              Folio <span>✳</span> Your study companion
            </span>
          </footer>
        </div>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {nav.map(([key, label, Icon, url]) => (
            <Link
              href={url}
              key={key}
              className={section === key ? "active" : ""}
            >
              <Icon size={21} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>
      {picker && (
        <Modal
          title={
            picker.mode === "review"
              ? "A little refresh."
              : picker.mode === "exam"
                ? "Feel ready for your next quiz."
                : "Let’s get some practice."
          }
          onClose={() => setPicker(null)}
        >
          <p className="muted">
            {picker.mode === "exam"
              ? "Start with the essentials, then practise one question at a time."
              : "Pick a subject. We’ll take it from there."}
          </p>
          <label className="field-label" htmlFor="subject-select">
            Subject
          </label>
          <select
            id="subject-select"
            value={picker.subject}
            onChange={(e) => setPicker({ ...picker, subject: e.target.value })}
          >
            {data.subjects.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {picker.mode === "review" && (
            <>
              <label className="field-label">How much time do you have?</label>
              <div className="segmented">
                {[5, 10, 20].map((n) => (
                  <button
                    key={n}
                    className={minutes === n ? "selected" : ""}
                    onClick={() => setMinutes(n)}
                  >
                    {n} minutes
                  </button>
                ))}
              </div>
              <p className="helper">
                A suggested pace, with no timer to rush you.
              </p>
            </>
          )}
          {picker.mode === "exam" && (
            <div className="callout">
              <Target size={22} />
              <div>
                <strong>Build your foundation</strong>
                <p>
                  Review flashcards, revisit weak topics or take a timed mock
                  exam.
                </p>
              </div>
            </div>
          )}
          <button
            className="primary full-width"
            disabled={busy}
            onClick={() => start(picker.mode, picker.subject, minutes)}
          >
            {busy
              ? "Getting ready…"
              : picker.mode === "review"
                ? "Start quick review"
                : picker.mode === "exam"
                  ? "Open exam prep"
                  : "Start practising"}
            <ArrowRight size={18} />
          </button>
        </Modal>
      )}
      {task && (
        <Modal title={task.title} onClose={() => setTask(null)}>
          <span className={`tag ${task.color}`}>{task.subject_name}</span>
          <p className="task-description">{task.description}</p>
          <div className="task-meta">
            <CalendarDays size={17} />
            {new Date(task.due_at).toLocaleString("en-GB", {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: data.profile.timezone,
            })}
          </div>
          {task.attachment && (
            <a
              className="secondary full-width"
              target="_blank"
              rel="noreferrer"
              href={"/resources/" + task.attachment}
            >
              <FileText size={17} />
              Open printable worksheet
              <ArrowUpRight size={17} />
            </a>
          )}
          <button
            className="primary full-width"
            disabled={busy}
            onClick={() => toggleTask(task)}
          >
            <Check size={18} />
            {task.completed ? "Mark as incomplete" : "Mark as complete"}
          </button>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </StudyContext.Provider>
  );
}
function Home() {
  const { data, start, busy, choose } = useStudy();
  const nextSubject = recommendedSubject(data);
  const pending = data.tasks.filter((t) => !t.completed);
  const urgent = pending.find((t) => t.type === "HOMEWORK");
  const active = data.active;
  const count = active ? active.question_ids.length - active.position : 4;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: data.profile.timezone,
    }).format(new Date()),
  );
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow greeting-eyebrow">
            A LITTLE BETTER, EVERY DAY
          </div>
          <h1>
            {greeting}, {data.profile.name.split(" ")[0]}{" "}
            <span className="greeting-sun">
              <Sun size={29} strokeWidth={1.4} />
            </span>
          </h1>
          <p>Let’s make a little room for progress.</p>
        </div>
        <span className="date-pill">
          <CalendarDays size={16} />
          {new Date().toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone: data.profile.timezone,
          })}
        </span>
      </div>
      <div className="home-columns">
        <div className="home-main">
          {data.authenticated ? (
            <DailyStudy key={data.profile.id} />
          ) : (
            <section className="focus-card">
              <div className="focus-copy">
                <span className="focus-eyebrow">
                  <span className="live-dot" />
                  {active
                    ? "PICK UP WHERE YOU LEFT OFF"
                    : "YOUR NEXT SMALL WIN"}
                </span>
                <h2>
                  Ready for
                  <br />
                  your next class?
                </h2>
                <p className="focus-subject">
                  {nextSubject?.name} <span>·</span>{" "}
                  {nextSubject?.next_class
                    ? dueLabel(nextSubject.next_class, data.profile.timezone)
                    : "Your pace"}
                </p>
                <p className="focus-detail">
                  {count} exercises. A little closer to “I’ve got this.”
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    start(
                      active?.mode || "practice",
                      nextSubject.id,
                      10,
                      !!active,
                    )
                  }
                >
                  {busy
                    ? "Getting ready…"
                    : active
                      ? "Continue studying"
                      : "Start studying"}
                  <ArrowRight size={18} />
                </button>
                <div className="focus-bottom">
                  <Clock3 size={14} />
                  <span>About {count * 4} minutes</span>
                  <span className="focus-divider">·</span>
                  <span>One question at a time</span>
                </div>
              </div>
              <StudyIllustration />
            </section>
          )}
          <section className="modes-section">
            <SectionHeading title="Make this moment count" />
            <div className="mode-grid">
              <ModeCard
                mode="review"
                title="Quick review"
                description="A refresh in 5–20 minutes"
                icon={<Zap size={22} />}
                color="mint"
                onClick={() => choose("review")}
              />
              <ModeCard
                mode="practice"
                title="Practice"
                description="Learn by working it out"
                icon={<BookOpen size={22} />}
                color="lavender"
                onClick={() => choose("practice")}
              />
              <ModeCard
                mode="exam"
                title="Exam prep"
                description="Go in feeling prepared"
                icon={<Target size={22} />}
                color="peach"
                onClick={() => choose("exam")}
              />
            </div>
          </section>
          <section className="subjects-section">
            <SectionHeading
              title="Your subjects"
              action="View all subjects"
              href="/study"
            />
            <div className="home-subject-grid">
              {data.subjects.slice(0, 3).map((s) => (
                <SubjectCard key={s.id} subject={s} />
              ))}
            </div>
          </section>
          {!data.authenticated && urgent && (
            <div className="gentle-note">
              <span className="note-icon">
                <BookOpen size={18} />
              </span>
              <p>
                <strong>Tomorrow you will thank you.</strong> {urgent.title}{" "}
                before your next class.
              </p>
              <Link href="/tasks" aria-label="See your homework">
                <ArrowRight size={18} />
              </Link>
            </div>
          )}
        </div>
        <aside className="home-aside">
          <section className="horizon-section">
            <SectionHeading
              title="On your horizon"
              action="View all"
              href="/tasks"
            />
            <div className="horizon-list">
              {pending.slice(0, 3).map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
              {!pending.length && (
                <p className="empty-inline">
                  All caught up. Enjoy a little breathing room.
                </p>
              )}
            </div>
          </section>
          <StreakCard />
          <section className="daily-goal">
            <div>
              <span className="eyebrow">A LITTLE EVERY DAY</span>
              <h3>Your daily goal</h3>
              <p>
                {Math.min(data.todayXp, data.profile.daily_goal)} of{" "}
                {data.profile.daily_goal} XP earned
              </p>
              <Link href="/progress">
                See your progress
                <ArrowUpRight size={14} />
              </Link>
            </div>
            <div
              className="goal-ring"
              style={
                {
                  "--goal": `${Math.min(data.todayXp / data.profile.daily_goal, 1) * 360}deg`,
                } as React.CSSProperties
              }
            >
              <span>
                <Sprout size={25} />
              </span>
            </div>
          </section>
          <div className="quiet-quote">
            <span>“</span>
            <p>
              Great things are done by a series
              <br />
              of small things brought together.
            </p>
            <small>VINCENT VAN GOGH</small>
          </div>
        </aside>
      </div>
    </>
  );
}
function ModeCard({
  title,
  description,
  icon,
  color,
  onClick,
}: {
  mode: Mode;
  title: string;
  description: string;
  icon: ReactNode;
  color: string;
  onClick: () => void;
}) {
  return (
    <button className="mode-card" onClick={onClick}>
      <span className={`mode-icon ${color}`}>{icon}</span>
      <ArrowUpRight className="mode-arrow" size={17} />
      <strong>{title}</strong>
      <span className="mode-description">{description}</span>
    </button>
  );
}
export function SubjectCard({ subject: s }: { subject: Subject }) {
  return (
    <Link className="subject-card" href={"/study/" + s.id}>
      <div className="subject-card-top">
        <SubjectIcon subject={s} />
        <span>{s.code}</span>
      </div>
      <h3>{s.name}</h3>
      <p>{s.total_questions} practice questions</p>
      <div className="subject-progress-label">
        <span>Course progress</span>
        <strong>{s.progress}%</strong>
      </div>
      <ProgressBar value={s.progress} label={`${s.name} course progress`} />
    </Link>
  );
}
export function TaskRow({ task: t }: { task: Task }) {
  const { data, toggleTask, openTask, busy } = useStudy();
  const Icon =
    t.type === "PRINT"
      ? FileText
      : t.type === "BRING"
        ? Backpack
        : t.type === "QUIZ" || t.type === "EXAM"
          ? Target
          : BookOpen;
  return (
    <div className={`task-row ${t.completed ? "completed" : ""}`}>
      <button
        className={`task-check ${t.completed ? "checked" : ""}`}
        onClick={() => toggleTask(t)}
        disabled={busy}
        aria-label={`${t.completed ? "Mark incomplete" : "Complete"}: ${t.title}`}
      >
        {t.completed ? <Check size={13} /> : <Icon size={17} />}
      </button>
      <button className="task-row-body" onClick={() => openTask(t)}>
        <span className="task-row-subject">{t.subject_name}</span>
        <strong>{t.title}</strong>
        <span
          className={`task-due ${dueLabel(t.due_at, data.profile.timezone) === "Overdue" ? "overdue" : ""}`}
        >
          <Clock3 size={12} />
          {t.completed
            ? "Completed"
            : dueLabel(t.due_at, data.profile.timezone)}
        </span>
      </button>
    </div>
  );
}
export function StreakCard() {
  const { data } = useStudy();
  return (
    <section className="streak-card">
      <div className="streak-top">
        <span className="flame-icon">
          <Flame size={27} />
        </span>
        <div>
          <strong>{data.streak}-day streak</strong>
          <p>
            {data.streak
              ? "Look at you, showing up."
              : "Your next chapter starts today."}
          </p>
        </div>
        <span className="tiny-star">✧</span>
      </div>
      <div className="week-days">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
          <div key={i}>
            <span>{day}</span>
            <i className={data.weekDays[i] ? "done" : ""}>
              {data.weekDays[i] ? <Check size={13} /> : <span />}
            </i>
          </div>
        ))}
      </div>
      <p className="streak-bottom">
        Small efforts add up. Keep going at your pace.
      </p>
    </section>
  );
}
