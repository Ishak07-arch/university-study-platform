import { randomUUID } from "node:crypto";
import type { Db } from "./db";
import type { Profile, TaskType } from "@/lib/types";
import { requireAdmin, HttpError, audit } from "./auth";
import { award } from "./learning";
export type ReminderInput = {
  subject_id: string;
  group_id: string;
  title: string;
  description: string;
  type: TaskType;
  due_at: string;
  importance: number;
};
export async function createReminder(
  db: Db,
  actor: Profile,
  input: ReminderInput,
) {
  requireAdmin(actor);
  if (input.group_id === "demo-group")
    throw new HttpError(
      400,
      "Choose a student class. The demo class is reserved for sample reminders.",
    );
  return db.transaction(async (tx) => {
    const group = await tx.query(
      "SELECT g.id FROM class_groups g JOIN subjects s ON s.semester_id=g.semester_id WHERE g.id=$1 AND s.id=$2",
      [input.group_id, input.subject_id],
    );
    if (!group.rows.length)
      throw new HttpError(
        400,
        "Choose a subject in the selected group’s semester.",
      );
    const id = randomUUID();
    await tx.query(
      "INSERT INTO tasks(id,subject_id,group_id,title,description,type,due_at,importance,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        input.subject_id,
        input.group_id,
        input.title,
        input.description,
        input.type,
        input.due_at,
        input.importance,
        actor.id,
      ],
    );
    await audit(tx, actor.id, "task.created", id, input);
    return id;
  });
}

export async function completeReminder(
  db: Db,
  user: Profile,
  id: string,
  complete: boolean,
) {
  return db.transaction(async (tx) => {
    const task = (
      await tx.query<{ type: TaskType }>(
        "SELECT type FROM tasks WHERE id=$1 AND group_id=$2",
        [id, user.group_id],
      )
    ).rows[0];
    if (!task) throw new HttpError(404, "Task not found.");
    if (!complete) {
      await tx.query(
        "DELETE FROM task_completions WHERE user_id=$1 AND task_id=$2",
        [user.id, id],
      );
      return;
    }
    const inserted = await tx.query(
      "INSERT INTO task_completions(user_id,task_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING task_id",
      [user.id, id],
    );
    if (
      inserted.rows.length &&
      task.type === "HOMEWORK" &&
      user.role === "student"
    ) {
      await award(tx, user, "homework:" + id, 3, "Completed class homework");
      await tx.query("SELECT folio_badge($1,'homework')", [user.id]);
    }
  });
}
