export const timeOptions = [5, 10, 20, 30, 45] as const;
export type PlanItem = {
  key: string;
  kind: "task" | "practice" | "cards" | "resume" | "exam";
  subject: string;
  title: string;
  reason: string;
  priority: number;
  minutes: number;
  lesson?: string;
  topic?: string;
  id?: string;
  done?: boolean;
};
export interface TopicSignal {
  topic: string;
  lesson: string;
  rank: number;
  score: number | null;
  evidence: number;
  group: string;
  reason: string;
  last: number;
  memory: { status: string; count: number }[];
}
export function countdown(date: string | Date, zone: string, now: Date) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return Math.round(
    (Date.parse(day.format(new Date(date))) - Date.parse(day.format(now))) /
      86400000,
  );
}
export function topicPriority(
  t: TopicSignal,
  days: number | null,
  now: number,
  importance = 1,
) {
  const exam =
    days === null
      ? 0
      : Math.max(0, 60 - 6 * days) + (days <= 7 ? 5 * importance : 0);
  const recurrence = t.memory.some(
    (m) => m.count >= 2 && m.status !== "Resolved",
  )
    ? 12
    : 0;
  return (
    45 -
    6 * t.rank +
    (50 - (t.score ?? 50)) / 4 +
    recurrence +
    exam +
    (!t.last || now - t.last > 14 * 86400000 ? 4 : 0)
  );
}
export function fitPlan(items: PlanItem[], minutes: number) {
  let left = minutes;
  const selected: PlanItem[] = [];
  for (const item of [...items]
    .filter((i) => !i.done)
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key))) {
    if (selected.length === 4 || left < 3) break;
    const allocated = Math.min(left, item.minutes);
    selected.push({ ...item, minutes: allocated });
    left -= allocated;
  }
  return selected;
}
export function readiness(topics: TopicSignal[], mocks: number[]) {
  if (
    !topics.length ||
    (!mocks.length && topics.every((t) => t.score === null))
  )
    return null;
  // A topic gradually earns its share of coverage. Sparse evidence stays close
  // to the starting estimate. Each topic has an equal share of the syllabus.
  const baseline = 40;
  const mean =
    topics.reduce((n, t) => {
      const confidence = Math.min(1, t.evidence / 6);
      const penalty = t.memory.some(
        (m) => m.count >= 2 && m.status !== "Resolved",
      )
        ? 4
        : 0;
      return (
        n + baseline + confidence * ((t.score ?? baseline) - baseline - penalty)
      );
    }, 0) / topics.length;
  const recent = mocks.slice(0, 4);
  // Each of four recent mocks can move the estimate by at most 4 points.
  return Math.round(
    Math.max(
      0,
      Math.min(99, mean + recent.reduce((n, p) => n + 0.04 * (p - mean), 0)),
    ),
  );
}
