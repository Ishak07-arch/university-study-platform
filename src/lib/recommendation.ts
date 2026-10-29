import type { Snapshot } from "./types";

// Keep the first choice understandable. More advanced recommendations belong
// behind this interface, not in the student's navigation.
export function recommendedSubject(
  data: Pick<Snapshot, "subjects" | "tasks" | "active">,
  now = Date.now(),
) {
  const resume = data.subjects.find((s) => s.id === data.active?.subject_id);
  if (resume) return resume;
  const tasks = data.tasks
    .filter((t) => !t.completed)
    .sort(
      (a, b) =>
        new Date(a.due_at).getTime() - new Date(b.due_at).getTime() ||
        b.importance - a.importance,
    );
  const homework = tasks.find(
    (t) =>
      t.type === "HOMEWORK" &&
      new Date(t.due_at).getTime() - now < 2 * 86400000,
  );
  const exam = tasks.find(
    (t) =>
      (t.type === "QUIZ" || t.type === "EXAM") &&
      new Date(t.due_at).getTime() >= now &&
      new Date(t.due_at).getTime() - now < 7 * 86400000,
  );
  const preparation = tasks.find(
    (t) =>
      ["PRINT", "BRING", "CLASS_PREPARATION"].includes(t.type) &&
      new Date(t.due_at).getTime() - now < 2 * 86400000,
  );
  const taskSubject = data.subjects.find(
    (s) => s.id === (homework || exam || preparation)?.subject_id,
  );
  if (taskSubject) return taskSubject;
  return (
    [...data.subjects]
      .filter((s) => s.next_class && new Date(s.next_class).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.next_class!).getTime() - new Date(b.next_class!).getTime(),
      )[0] || [...data.subjects].sort((a, b) => a.progress - b.progress)[0]
  );
}
