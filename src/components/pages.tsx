"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  Clock3,
  Download,
  Flame,
  GraduationCap,
  LogOut,
  Medal,
  Plus,
  Search,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useStudy,
  SubjectCard,
  TaskRow,
  StreakCard,
  dueLabel,
} from "./app-shell";
import { ProgressBar, SubjectIcon } from "./ui";
import { api } from "@/lib/api";
import { LessonResources } from "./tutor-panel";
import { LessonPractice } from "./exercise-entry";
import { TopicCoach } from "./topic-coach";
export function StudyPage({ subjectId }: { subjectId?: string }) {
  const { data, choose, start, busy } = useStudy();
  const [search, setSearch] = useState("");
  const [lesson, setLesson] = useState<string | null>(null);
  const subject = data.subjects.find((s) => s.id === subjectId);
  if (subject) {
    const lessons = data.lessons.filter((l) => l.subject_id === subjectId);
    return (
      <>
        <Link href="/study" className="back-link">
          <ArrowLeft size={16} />
          All subjects
        </Link>
        <div className="subject-page-heading">
          <SubjectIcon subject={subject} />
          <div>
            <span className="eyebrow">{subject.code} · SEMESTER 1</span>
            <h1>{subject.name}</h1>
            <p>{subject.description}</p>
          </div>
        </div>
        <div className="subject-detail-grid">
          <div>
            {!data.profile.is_demo ? (
              <TopicCoach key={subject.id} subject={subject.id} />
            ) : (
              <section className="subject-study-banner">
                <span className="eyebrow">YOUR NEXT STEP</span>
                <h2>A little practice goes a long way.</h2>
                <p>
                  {subject.solved} of {subject.total_questions} questions
                  solved. Take the next one at your own pace.
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => start("practice", subject.id)}
                >
                  {busy ? "Getting ready…" : "Start practising"}
                  <ArrowRight size={18} />
                </button>
              </section>
            )}
            <div className="section-heading">
              <h2>Your learning path</h2>
              <span className="muted">
                {lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
              </span>
            </div>
            <div className="lesson-list">
              {lessons.map((l, i) => (
                <article className="lesson-item" key={l.id}>
                  <button
                    onClick={() => setLesson(lesson === l.id ? null : l.id)}
                    aria-expanded={lesson === l.id}
                  >
                    <span className="lesson-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <small>{l.chapter}</small>
                      <strong>{l.title}</strong>
                    </span>
                    <Plus
                      size={19}
                      className={lesson === l.id ? "rotated" : ""}
                    />
                  </button>
                  {lesson === l.id && (
                    <div className="lesson-body">
                      <p>{l.body}</p>
                      <LessonResources
                        lessonId={l.id}
                        demo={data.profile.is_demo || !data.authenticated}
                      />
                      {data.authenticated && !data.profile.is_demo && (
                        <LessonPractice lessonId={l.id} />
                      )}
                      <button
                        className="text-button"
                        onClick={() => choose("review", subject.id)}
                      >
                        Review this subject
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {!lessons.length && (
                <p className="empty-inline">
                  Your first lessons are on the way. Check back after your next
                  class.
                </p>
              )}
            </div>
          </div>
          <aside>
            <div className="panel">
              <h3>Make it your kind of session</h3>
              <button
                className="action-row"
                onClick={() => choose("review", subject.id)}
              >
                <span className="mode-icon mint">
                  <Zap size={20} />
                </span>
                <span>
                  <strong>Quick review</strong>
                  <small>Refresh the essentials</small>
                </span>
                <ArrowUpRight size={17} />
              </button>
              <button
                className="action-row"
                onClick={() => choose("exam", subject.id)}
              >
                <span className="mode-icon peach">
                  <Target size={20} />
                </span>
                <span>
                  <strong>Exam prep</strong>
                  <small>Build your confidence</small>
                </span>
                <ArrowUpRight size={17} />
              </button>
            </div>
            {subject.next_class && (
              <div className="panel class-prep">
                <span className="eyebrow">YOUR NEXT CLASS</span>
                <h3>
                  {dueLabel(subject.next_class, data.profile.timezone)} ·{" "}
                  {new Date(subject.next_class).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: data.profile.timezone,
                  })}
                </h3>
                <p>{subject.room}</p>
                {data.tasks
                  .filter((t) => t.subject_id === subjectId)
                  .map((t) => (
                    <TaskRow task={t} key={t.id} />
                  ))}
                <button
                  className="secondary full-width"
                  onClick={() => choose("review", subject.id)}
                >
                  Prepare me for class
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </aside>
        </div>
      </>
    );
  }
  return (
    <>
      <PageTitle
        eyebrow="YOUR LEARNING, YOUR PACE"
        title="One subject. One small step."
        description="Everything you need for this semester, in one quiet place."
      />
      <div className="study-toolbar">
        <span className="tag green">
          <GraduationCap size={15} />
          Year 1 · Semester 1
        </span>
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label="Search subjects"
            placeholder="Find a subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="subject-grid">
        {data.subjects
          .filter((s) =>
            (s.name + " " + s.code)
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((s) => (
            <SubjectCard subject={s} key={s.id} />
          ))}
      </div>
      {!data.subjects.some((s) =>
        (s.name + " " + s.code).toLowerCase().includes(search.toLowerCase()),
      ) && (
        <div className="empty-state">
          <Search size={30} />
          <h2>No subjects found.</h2>
          <p>Try a shorter name or a course code.</p>
          <button className="secondary" onClick={() => setSearch("")}>
            Show all subjects
          </button>
        </div>
      )}
      <div className="gentle-note">
        <BookOpen size={20} />
        <p>
          Not sure where to start? A five-minute review is always a good first
          step.
        </p>
        <button className="text-button" onClick={() => choose("review")}>
          Let’s do it
          <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
export function ProgressPage() {
  const [mapSubject, setMapSubject] = useState("");
  const { data, choose } = useStudy();
  const solved = data.subjects.reduce((a, s) => a + s.solved, 0);
  return (
    <>
      <PageTitle
        eyebrow="LOOK HOW FAR YOU’VE COME"
        title="Your effort is adding up."
        description="Every question, every correction, every time you show up."
      />
      <div className="progress-summary">
        <div className="summary-stat">
          <span className="mode-icon mint">
            <Zap size={22} />
          </span>
          <span>
            <strong>
              {data.xp.toLocaleString()}
              <small>XP</small>
            </strong>
            <p>Total learning points</p>
          </span>
        </div>
        <div className="summary-stat">
          <span className="mode-icon lavender">
            <BookOpen size={22} />
          </span>
          <span>
            <strong>
              {solved}
              <small>questions</small>
            </strong>
            <p>Worked through successfully</p>
          </span>
        </div>
        <div className="summary-stat">
          <span className="mode-icon peach">
            <Flame size={22} />
          </span>
          <span>
            <strong>
              {data.streak}
              <small>days</small>
            </strong>
            <p>Of showing up for yourself</p>
          </span>
        </div>
      </div>
      {data.profile.id !== "preview" && (
        <label className="field-label">
          Explore your weakness map
          <select
            value={mapSubject}
            onChange={(e) => setMapSubject(e.target.value)}
          >
            <option value="">Choose a subject</option>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {mapSubject && <TopicCoach key={mapSubject} subject={mapSubject} map />}
      <div className="progress-columns">
        <section className="panel progress-panel">
          <div className="section-heading">
            <h2>A little clearer, subject by subject</h2>
          </div>
          <p className="helper">
            Practice coverage shows the share of available questions you’ve
            solved. It’s a starting point, not an exam score.
          </p>
          {data.subjects.map((s) => (
            <div className="progress-subject" key={s.id}>
              <SubjectIcon subject={s} />
              <div>
                <div className="progress-subject-title">
                  <strong>{s.name}</strong>
                  <span>{s.progress}%</span>
                </div>
                <ProgressBar
                  value={s.progress}
                  label={`${s.name} practice coverage`}
                />
                <div className="progress-subject-bottom">
                  <span>
                    {s.solved} of {s.total_questions} questions solved
                  </span>
                  <button
                    className="text-button"
                    onClick={() => choose("practice", s.id)}
                  >
                    {s.progress === 100 ? "Keep it fresh" : "Keep practising"}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>
        <aside>
          <StreakCard />
          <div className="panel xp-explainer">
            <span className="eyebrow">EFFORT WORTH REWARDING</span>
            <h3>How your XP adds up</h3>
            <p>
              <span>First correct answer</span>
              <strong>+5 XP</strong>
            </p>
            <p>
              <span>Correct a mistake</span>
              <strong>+7 XP</strong>
            </p>
            <p>
              <span>Complete a study session</span>
              <strong>+10 XP</strong>
            </p>
            <p>
              <span>Complete a quick review</span>
              <strong>+8 XP</strong>
            </p>
            <small>
              Each question and unique session earns points once. XP celebrates
              learning and is separate from academic grades.
            </small>
          </div>
        </aside>
      </div>
    </>
  );
}
export function LeaderboardPage() {
  const { data } = useStudy();
  const [period, setPeriod] = useState<"week" | "month">("week");
  const leaders = period === "week" ? data.leaders : data.monthlyLeaders;
  return (
    <>
      <PageTitle
        eyebrow="A LITTLE FRIENDLY MOTIVATION"
        title="Better, together."
        description="Celebrate the effort. Cheer on your classmates. Find your own pace."
      />
      <div className="leaderboard-layout">
        <section className="panel leaderboard-panel">
          <div className="leaderboard-toolbar">
            <div className="segmented">
              <button
                className={period === "week" ? "selected" : ""}
                onClick={() => setPeriod("week")}
              >
                This week
              </button>
              <button
                className={period === "month" ? "selected" : ""}
                onClick={() => setPeriod("month")}
              >
                This month
              </button>
            </div>
            <span className="muted">
              <GraduationCap size={17} />
              {data.profile.group_name || "Your class"}
            </span>
          </div>
          {data.profile.is_demo && (
            <p className="demo-note">
              Sample classmates · Your demo points update as you study.
            </p>
          )}
          <div className="leaderboard-labels">
            <span>RANK</span>
            <span>CLASSMATE</span>
            <span>LEARNING XP</span>
          </div>
          {leaders.map((l, i) => (
            <div className={`leader-row ${l.is_you ? "you" : ""}`} key={l.id}>
              <span className={`rank rank-${i + 1}`}>
                {i < 3 ? <Medal size={23} /> : String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <span className={`avatar leader-avatar tone-${i % 4}`}>
                  {l.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <strong>
                  {l.name}
                  {l.is_you && <span className="you-label">You</span>}
                </strong>
              </div>
              <strong>
                {l.xp.toLocaleString()}
                <small>XP</small>
              </strong>
            </div>
          ))}
          {!leaders.length && (
            <div className="empty-state">
              <Trophy size={32} />
              <h3>A fresh start for your group.</h3>
              <p>
                Complete a practice question to put your first points on the
                board.
              </p>
              <Link className="primary" href="/study">
                Start studying
              </Link>
            </div>
          )}
          <div className="leaderboard-footnote">
            <SproutIcon />
            Progress looks different for everyone. Yours counts.
          </div>
        </section>
        <aside>
          <div className="personal-score">
            <span className="mode-icon mint">
              <Trophy size={24} />
            </span>
            <span className="eyebrow">YOUR OWN PERSONAL BEST</span>
            <h2>
              {data.weeklyXp.toLocaleString()} <span>XP</span>
            </h2>
            <p>earned this week</p>
            <div className="score-divider" />
            <strong>
              {data.weeklyXp >= data.previousXp ? "+" : ""}
              {data.weeklyXp - data.previousXp} XP{" "}
              <span>compared with last week</span>
            </strong>
            <Link className="secondary full-width" href="/study">
              Keep your momentum
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="leaderboard-note">
            <h3>The real win?</h3>
            <p>Understanding something today that felt difficult yesterday.</p>
            <p>You don’t need to be first to be making progress.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
function SproutIcon() {
  return <Sparkles size={16} />;
}
export function ProfilePage() {
  const { data, refresh, notify } = useStudy();
  const [name, setName] = useState(data.profile.name);
  const [goal, setGoal] = useState(data.profile.daily_goal);
  const [timezone, setTimezone] = useState(data.profile.timezone);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("profile", { name, daily_goal: goal, timezone });
      await refresh();
      notify("Your study space is a little more you. Profile saved.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="YOUR SPACE, YOUR PACE"
        title="Make yourself at home."
        description="A few simple settings for the way you like to study."
      />
      <div className="profile-layout">
        <form className="panel profile-form" onSubmit={save}>
          <div className="profile-identity">
            <span className="avatar avatar-large">
              {data.profile.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <h2>{data.profile.name}</h2>
              <p>
                {data.profile.is_demo
                  ? "Your personal demo workspace"
                  : data.profile.email}
              </p>
            </div>
          </div>
          <label className="field-label" htmlFor="profile-name">
            Your name
          </label>
          <input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={60}
          />
          <label className="field-label" htmlFor="goal">
            Daily learning goal
          </label>
          <select
            id="goal"
            value={goal}
            onChange={(e) => setGoal(Number(e.target.value))}
          >
            {[10, 20, 30, 40, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n} XP a day
              </option>
            ))}
          </select>
          <p className="helper">
            A gentle nudge, never a deadline. Adjust it whenever you need.
          </p>
          <label className="field-label" htmlFor="timezone">
            Timezone
          </label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {[
              "Africa/Lagos",
              "Africa/Algiers",
              "Africa/Cairo",
              "Europe/London",
              "Europe/Paris",
              "America/New_York",
              "Asia/Kolkata",
              "Asia/Dubai",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
            <Check size={17} />
          </button>
        </form>
        <aside>
          <div className="panel">
            <GraduationCap size={28} />
            <h3>Your academic home</h3>
            <p>Faculty of Business & Economics</p>
            <dl className="profile-details">
              <div>
                <dt>Year</dt>
                <dd>Year 1</dd>
              </div>
              <div>
                <dt>Semester</dt>
                <dd>Semester 1</dd>
              </div>
              <div>
                <dt>Class</dt>
                <dd>{data.profile.group_name || "Your class"}</dd>
              </div>
            </dl>
          </div>
          {data.profile.is_demo && (
            <div className="panel demo-profile">
              <h3>Make your progress yours.</h3>
              <p>
                This is a demo account. Create a personal account for a fresh
                start and secure access.
              </p>
              <Link className="secondary full-width" href="/sign-up">
                Create an account
                <ArrowUpRight size={16} />
              </Link>
            </div>
          )}
          <button
            className="sign-out"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("logout");
                router.push("/sign-in");
                router.refresh();
              } catch (e) {
                notify((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <LogOut size={17} />
            Sign out
          </button>
        </aside>
      </div>
    </>
  );
}
export function TasksPage() {
  const { data } = useStudy();
  const [filter, setFilter] = useState("upcoming");
  const tasks = data.tasks.filter((t) =>
    filter === "completed" ? t.completed : !t.completed,
  );
  return (
    <>
      <PageTitle
        eyebrow="A LITTLE LESS TO REMEMBER"
        title="You’ve got things covered."
        description="Your homework, class prep, and the little things to bring along."
      />
      <div className="tasks-layout">
        <section className="panel">
          <div className="tasks-toolbar">
            <div className="segmented">
              <button
                className={filter === "upcoming" ? "selected" : ""}
                onClick={() => setFilter("upcoming")}
              >
                To do{" "}
                <span>{data.tasks.filter((t) => !t.completed).length}</span>
              </button>
              <button
                className={filter === "completed" ? "selected" : ""}
                onClick={() => setFilter("completed")}
              >
                Completed
              </button>
            </div>
          </div>
          {tasks.map((t) => (
            <TaskRow task={t} key={t.id} />
          ))}
          {!tasks.length && (
            <div className="empty-state">
              <Check size={32} />
              <h2>
                {filter === "completed"
                  ? "A fresh checklist."
                  : "You’re all caught up."}
              </h2>
              <p>
                {filter === "completed"
                  ? "Completed tasks will appear here."
                  : "Take a breath. Your next little step can wait."}
              </p>
            </div>
          )}
        </section>
        <aside className="task-tip">
          <BackpackIcon />
          <h3>Tomorrow, made easier.</h3>
          <p>
            Check your reminders before leaving for class. A printed worksheet
            and a charged calculator can make all the difference.
          </p>
        </aside>
      </div>
    </>
  );
}
function BackpackIcon() {
  return <BookOpen size={32} strokeWidth={1.5} />;
}
