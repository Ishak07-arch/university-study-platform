import type { Db } from "./db";
import type { Profile } from "@/lib/types";
import { visibleQuestion } from "./questions";
import { assertSubject, startSession } from "./learning";
import { HttpError } from "./auth";

interface Candidate {
  id: string;
  lesson_id: string;
  topic: string;
  difficulty: number;
  recent_good: boolean;
  due?: boolean;
  reviewed_today?: boolean;
}
interface Evidence {
  question_id: string;
  at: Date | string;
  correct: boolean;
  retry: boolean;
  exercise: string;
  exam: string | null;
}
interface Mistake {
  question_id: string;
  pattern: string;
  occurrences: number;
  last_seen_at: Date | string;
  corrected: boolean;
  recovery_steps: number;
}
const day = 86400000;
const stamp = (date: Date | string) => new Date(date).getTime();
export function assess(
  questions: Candidate[],
  history: Evidence[],
  mistakes: Mistake[],
  now = Date.now(),
) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const events = history
    .filter((e) => byId.has(e.question_id))
    .sort((a, b) => stamp(b.at) - stamp(a.at));
  const patterns = new Map<string, Mistake[]>();
  for (const m of mistakes.filter((m) => byId.has(m.question_id)))
    patterns.set(m.pattern, [...(patterns.get(m.pattern) ?? []), m]);
  const memory = Array.from(patterns, ([pattern, rows]) => {
    const last = Math.max(...rows.map((m) => stamp(m.last_seen_at)));
    // Independent successful exercises after the latest recurrence, not repeated retries.
    const corrections = Math.max(
      ...rows
        .filter((m) => stamp(m.last_seen_at) === last)
        .map((m) => m.recovery_steps),
      new Set(
        events
          .filter((e) => e.correct && !e.retry && stamp(e.at) > last)
          .map((e) => e.exercise),
      ).size,
    );
    const status =
      corrections >= 3
        ? "Resolved"
        : corrections || rows.every((m) => m.corrected)
          ? "Improving"
          : "Needs practice";
    return {
      pattern,
      count: rows.reduce((n, m) => n + m.occurrences, 0),
      last,
      corrections,
      status,
    };
  });
  // Count a submitted exam as one observation in the recency window.
  const positions = new Map<string, number>();
  const recent = events.filter((e, i) => {
    const key = e.exam ?? "practice:" + i;
    if (!positions.has(key)) positions.set(key, positions.size);
    return positions.get(key)! < 24;
  });
  const examSizes = new Map<string, number>();
  for (const e of recent)
    if (e.exam) examSizes.set(e.exam, (examSizes.get(e.exam) || 0) + 1);
  // A neutral prior shrinks estimates when old evidence fades. One exam contributes
  // at most one normal answer's weight per topic, even if it repeats that concept.
  let weight = 0,
    earned = 0;
  recent.forEach((e, i) => {
    const age = Math.max(0, now - stamp(e.at)) / day;
    const source = e.exam ? 0.75 / examSizes.get(e.exam)! : e.retry ? 0.35 : 1;
    const w =
      Math.pow(0.5, age / 30) *
      Math.pow(0.9, positions.get(e.exam ?? "practice:" + i) ?? 23) *
      source;
    weight += w;
    if (e.correct)
      earned += w * (1 + 0.04 * (byId.get(e.question_id)!.difficulty - 1));
  });
  const score = recent.length
    ? Math.round(
        (100 * (0.75 + earned)) / (1.5 + weight) +
          (questions.some((q) => q.recent_good) ? 1 : 0),
      )
    : null;
  const independent = events.filter((e) => !e.retry);
  const distinct: Evidence[] = [];
  for (const e of independent) {
    if (!distinct.some((prior) => prior.exercise === e.exercise))
      distinct.push(e);
    if (distinct.length === 5) break;
  }
  let target = 1;
  for (const level of [1, 2, 3]) {
    if (
      distinct.filter(
        (e) =>
          e.correct &&
          byId.get(e.question_id)!.difficulty >= level &&
          now - stamp(e.at) < 30 * day,
      ).length >= 3
    )
      target = level + 1;
  }
  if (distinct.slice(0, 3).filter((e) => !e.correct).length >= 2)
    target = Math.max(
      1,
      Math.min(target, byId.get(independent[0].question_id)!.difficulty - 1),
    );
  const last = recent.length ? stamp(recent[0].at) : 0;
  const unresolved = memory.filter(
    (m) => m.status !== "Resolved" && now - m.last < 30 * day,
  );
  const group =
    score === null
      ? "Unpractised"
      : score < 45 && recent.length >= 2
        ? "Priority"
        : score >= 75 && !unresolved.length
          ? "Strong"
          : "Needs practice";
  const rank =
    group === "Priority"
      ? 0
      : unresolved.some((m) => m.count >= 2)
        ? 1
        : recent[0] && !recent[0].correct
          ? 2
          : !last || now - last > 14 * day
            ? 3
            : group === "Strong"
              ? 5
              : 4;
  const lastFor = (q: Candidate) => events.find((e) => e.question_id === q.id);
  const choices = [...questions].sort(
    (a, b) =>
      Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target) ||
      Number(lastFor(b)?.correct === false) -
        Number(lastFor(a)?.correct === false) ||
      (lastFor(a) ? stamp(lastFor(a)!.at) : 0) -
        (lastFor(b) ? stamp(lastFor(b)!.at) : 0) ||
      a.id.localeCompare(b.id),
  );
  const misses = recent.filter((e) => !e.correct).length;
  const reason = !events.length
    ? "Start with a topic you haven’t practised yet."
    : unresolved.length
      ? `Revisit the ${unresolved[0].pattern} pattern from your recent work.`
      : now - last > 14 * day
        ? "It has been over two weeks since you practised this topic."
        : misses
          ? `You missed ${misses} of the last ${recent.length} answers on this topic.`
          : "Your recent answers were correct. Try the next available exercise.";
  return {
    topic: questions[0].topic,
    lesson: questions[0].lesson_id,
    score: score === null ? null : Math.min(100, score),
    group,
    poolSize: questions.length,
    evidence: weight,
    due: questions.filter((q) => q.due).length,
    reviewed: questions.filter((q) => q.reviewed_today).length,
    memory,
    reason,
    rank,
    last,
    target,
    question: choices[0].id,
  };
}

export async function subjectProgress(db: Db, u: Profile, subject: string) {
  await assertSubject(db, u, subject);
  return progressForSubjects(db, u, [subject]);
}
// The Home planner uses one bounded data fetch across the student’s subjects.
export async function progressForSubjects(
  db: Db,
  u: Profile,
  subjects: string[],
) {
  const qs = (
    await db.query<Candidate & { subject: string }>(
      `SELECT s.id AS subject,q.id,q.lesson_id,q.topic,q.difficulty, (r.rating='Good' AND r.due_at>now()) recent_good, (r.due_at IS NULL OR r.due_at<=now()) due, ((r.reviewed_at AT TIME ZONE $5)::date=(now() AT TIME ZONE $5)::date) reviewed_today
 FROM questions q LEFT JOIN card_reviews r ON r.user_id=$4 AND r.question_id=q.id JOIN lessons l ON l.id=q.lesson_id JOIN chapters c ON c.id=l.chapter_id JOIN class_groups g ON g.id=$2 JOIN subjects s ON s.id=c.subject_id AND s.semester_id=g.semester_id WHERE s.id=ANY($1::text[]) AND ($3=false OR q.origin='seed') AND ${visibleQuestion}`,
      [subjects, u.group_id, u.is_demo, u.id, u.timezone],
    )
  ).rows;
  if (!qs.length) return [];
  const ids = qs.map((q) => q.id);
  const events = (
    await db.query<Evidence>(
      `SELECT a.*, NULL::text exam FROM unnest($2::text[]) AS pool(id) CROSS JOIN LATERAL
 (SELECT question_id,session_id || chr(31) || question_id AS exercise,created_at AS at,correct,attempt_number>1 AS retry FROM question_attempts WHERE user_id=$1 AND question_id=pool.id ORDER BY created_at DESC LIMIT 24) a
 UNION ALL SELECT i.question_id,e.id AS exercise,e.submitted_at,i.correct,false,e.id FROM
 unnest($3::text[]) AS subjects(subject_id) CROSS JOIN LATERAL (SELECT id,submitted_at FROM mock_exams m WHERE user_id=$1 AND m.subject_id=subjects.subject_id AND submitted_at IS NOT NULL ORDER BY submitted_at DESC LIMIT 12) e JOIN mock_items i ON i.exam_id=e.id WHERE i.question_id=ANY($2) AND i.response IS NOT NULL AND i.correct IS NOT NULL`,
      [u.id, ids, subjects],
    )
  ).rows;
  const mistakes = (
    await db.query<Mistake>(
      "SELECT question_id,pattern,occurrences,last_seen_at,corrected,recovery_steps FROM mistakes WHERE user_id=$1 AND question_id=ANY($2::text[])",
      [u.id, ids],
    )
  ).rows;
  const groups = new Map<string, typeof qs>();
  const evidenceByQuestion = Map.groupBy(events, (e) => e.question_id);
  const mistakesByQuestion = Map.groupBy(mistakes, (m) => m.question_id);
  for (const q of qs) {
    const key = JSON.stringify([q.lesson_id, q.topic]);
    const group = groups.get(key) ?? [];
    group.push(q);
    groups.set(key, group);
  }
  return Array.from(groups.values(), (g) => ({
    subject: g[0].subject,
    ...assess(
      g,
      g.flatMap((q) => evidenceByQuestion.get(q.id) ?? []),
      g.flatMap((q) => mistakesByQuestion.get(q.id) ?? []),
    ),
  })).sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.score ?? 50) - (b.score ?? 50) ||
      a.last - b.last ||
      a.topic.localeCompare(b.topic),
  );
}
export async function adaptivePractice(
  db: Db,
  u: Profile,
  subject: string,
  requested?: { lesson: string; topic: string; count?: number },
) {
  const topics = await subjectProgress(db, u, subject);
  const next = requested
    ? topics.find(
        (t) => t.lesson === requested.lesson && t.topic === requested.topic,
      )
    : topics[0];
  if (!next)
    throw new HttpError(
      409,
      "Practice will be available when questions are added.",
    );
  return startSession(
    db,
    u,
    subject,
    "practice",
    10,
    next.lesson,
    next.question,
    requested
      ? {
          topic: next.topic,
          count: Math.max(1, Math.min(3, requested.count ?? 1)),
          difficulty: next.target,
        }
      : undefined,
  );
}
