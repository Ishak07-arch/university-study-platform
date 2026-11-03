import type { Db } from "./db";
import type { Profile } from "@/lib/types";
import { subjectProgress, progressForSubjects } from "./personalisation";
import { subjectsSeed } from "./seed";
import {
  countdown,
  topicPriority,
  readiness,
  type PlanItem,
} from "@/lib/study-plan";

type Deadline = {
  id: string;
  subject_id: string;
  title: string;
  type: string;
  due_at: string;
  importance: number;
  completed: boolean;
  done_today: boolean;
};
async function deadlines(db: Db, u: Profile, subject?: string) {
  return (
    await db.query<Deadline>(
      `SELECT t.id,t.subject_id,t.title,t.type,t.due_at,t.importance,c.user_id IS NOT NULL completed,
 (c.completed_at AT TIME ZONE $3)::date=(now() AT TIME ZONE $3)::date done_today FROM tasks t LEFT JOIN task_completions c ON c.task_id=t.id AND c.user_id=$1
 WHERE t.group_id=$2 AND ($4::text IS NULL OR t.subject_id=$4) AND (c.user_id IS NULL OR t.type IN ('EXAM','QUIZ') OR c.completed_at>=date_trunc('day',now() AT TIME ZONE $3) AT TIME ZONE $3) ORDER BY t.due_at,t.importance DESC,t.id`,
      [u.id, u.group_id, u.timezone, subject ?? null],
    )
  ).rows;
}
function upcoming(tasks: Deadline[], now: Date) {
  return tasks.find(
    (t) => ["EXAM", "QUIZ"].includes(t.type) && new Date(t.due_at) >= now,
  );
}
async function recentMocks(db: Db, u: Profile, subject: string) {
  return (
    await db.query<{ score: number }>(
      `SELECT correct_count*100.0/graded_count AS score FROM mock_exams WHERE user_id=$1 AND subject_id=$2 AND submitted_at IS NOT NULL AND graded_count>0 ORDER BY submitted_at DESC LIMIT 4`,
      [u.id, subject],
    )
  ).rows.map((m) => Number(m.score));
}
export async function examOutlook(
  db: Db,
  u: Profile,
  subject: string,
  now = new Date(),
) {
  const topics = await subjectProgress(db, u, subject);
  const exam = upcoming(await deadlines(db, u, subject), now);
  return {
    days: exam ? countdown(exam.due_at, u.timezone, now) : null,
    title: exam?.title,
    score: readiness(topics, await recentMocks(db, u, subject)),
    strong: topics
      .filter((t) => t.group === "Strong")
      .slice(0, 2)
      .map((t) => t.topic),
    review: topics
      .filter((t) => t.group !== "Strong")
      .slice(0, 2)
      .map((t) => t.topic),
  };
}
export async function dailyStudy(db: Db, u: Profile, now = new Date()) {
  const subjects = (
    await db.query<{ id: string; name: string; next_class: string | null }>(
      "SELECT s.id,s.name,s.next_class FROM subjects s JOIN class_groups g ON g.semester_id=s.semester_id WHERE g.id=$1 ORDER BY s.id",
      [u.group_id],
    )
  ).rows.filter((s) => !u.is_demo || subjectsSeed.some(([id]) => id === s.id));
  const tasks = (await deadlines(db, u)).filter((t) =>
    subjects.some((s) => s.id === t.subject_id),
  );
  const items: PlanItem[] = [];
  for (const t of tasks) {
    if (
      ["ANNOUNCEMENT", "EXAM", "QUIZ"].includes(t.type) ||
      (t.completed && !t.done_today)
    )
      continue;
    const d = countdown(t.due_at, u.timezone, now);
    items.push({
      kind: "task",
      key: "task:" + t.id,
      id: t.id,
      subject: t.subject_id,
      title: t.title,
      reason:
        d < 0
          ? "This class task is overdue."
          : d === 0
            ? "Due today."
            : `Due in ${d} day${d === 1 ? "" : "s"}.`,
      priority:
        d <= 1
          ? 220 + 2 * t.importance - Math.max(0, d)
          : Math.max(4, 40 - d) + t.importance,
      minutes: ["PRINT", "BRING"].includes(t.type) ? 3 : 15,
      done: t.completed,
    });
  }
  const sessions = (
    await db.query<{
      id: string;
      subject_id: string;
      completed: boolean;
      lesson_id: string;
      topic: string;
    }>(
      `SELECT s.id,s.subject_id,s.completed_at IS NOT NULL completed,q.lesson_id,q.topic FROM study_sessions s LEFT JOIN questions q ON q.id=s.question_ids->>0 WHERE s.user_id=$1 AND (s.completed_at IS NULL OR (s.skipped=0 AND s.completed_at>=date_trunc('day',now() AT TIME ZONE $2) AT TIME ZONE $2)) ORDER BY s.updated_at DESC`,
      [u.id, u.timezone],
    )
  ).rows;
  const active = sessions.find(
    (s) => !s.completed && subjects.some((sub) => sub.id === s.subject_id),
  );
  if (active)
    items.push({
      kind: "resume",
      key: "session:" + active.id,
      id: active.id,
      subject: active.subject_id,
      title: "Continue studying",
      reason: "Pick up your saved session where you stopped.",
      priority: 130,
      minutes: 10,
    });
  const liveExam = (
    await db.query<{ id: string; subject_id: string }>(
      "SELECT id,subject_id FROM mock_exams WHERE user_id=$1 AND submitted_at IS NULL ORDER BY deadline LIMIT 1",
      [u.id],
    )
  ).rows[0];
  if (liveExam && subjects.some((s) => s.id === liveExam.subject_id))
    items.push({
      kind: "exam",
      key: "exam:" + liveExam.id,
      id: liveExam.id,
      subject: liveExam.subject_id,
      title: "Resume your mock exam",
      reason: "Your timed exam is still open.",
      priority: 140,
      minutes: 10,
    });
  let nearest: { title: string; days: number; subject: string } | null = null;
  const bySubject = Map.groupBy(
    await progressForSubjects(
      db,
      u,
      subjects.map((s) => s.id),
    ),
    (t) => t.subject,
  );
  for (const s of subjects) {
    const topics = bySubject.get(s.id) ?? [],
      exam = upcoming(
        tasks.filter((t) => t.subject_id === s.id),
        now,
      );
    const days = exam ? countdown(exam.due_at, u.timezone, now) : null;
    if (exam && days !== null && (!nearest || days < nearest.days))
      nearest = { title: exam.title, days, subject: s.id };
    for (const t of topics) {
      const done = sessions.some(
        (x) =>
          x.completed &&
          x.subject_id === s.id &&
          x.lesson_id === t.lesson &&
          x.topic === t.topic,
      );
      if (
        active?.subject_id === s.id &&
        active.lesson_id === t.lesson &&
        active.topic === t.topic &&
        !done
      )
        continue;
      const classDays = s.next_class
        ? countdown(s.next_class, u.timezone, now)
        : null;
      items.push({
        kind: "practice",
        key: JSON.stringify([s.id, t.lesson, t.topic]),
        subject: s.id,
        topic: t.topic,
        lesson: t.lesson,
        title: t.topic,
        reason: [
          s.name,
          days !== null && days <= 10
            ? `Exam in ${days} days.`
            : classDays !== null && classDays >= 0 && classDays <= 1
              ? "Your class meets soon."
              : "",
          t.reason,
        ]
          .filter(Boolean)
          .join(" · "),
        priority:
          topicPriority(t, days, now.getTime(), exam?.importance) +
          (classDays !== null && classDays >= 0 && classDays <= 1 ? 4 : 0),
        minutes: Math.min(3, t.poolSize) * 5,
        done,
      });
    }
    const due = topics.reduce((n, t) => n + t.due, 0),
      reviewed = topics.reduce((n, t) => n + t.reviewed, 0);
    if (due || reviewed)
      items.push({
        kind: "cards",
        key: "cards:" + s.id,
        subject: s.id,
        title: `Review ${Math.max(1, Math.min(3 - reviewed, due))} ${s.name} flashcards`,
        reason: `${due} cards are due for review.`,
        priority: 24 + (days !== null && days <= 3 ? 12 : 0),
        minutes: 3,
        done: reviewed >= 3 || !due,
      });
  }
  const finishedMocks = (
    await db.query<{ id: string }>(
      "SELECT id FROM mock_exams WHERE user_id=$1 AND submitted_at>=date_trunc('day',now() AT TIME ZONE $2) AT TIME ZONE $2",
      [u.id, u.timezone],
    )
  ).rows;
  return {
    items,
    nearest,
    completedKeys: [
      ...sessions.filter((s) => s.completed).map((s) => "session:" + s.id),
      ...finishedMocks.map((m) => "exam:" + m.id),
    ],
  };
}
