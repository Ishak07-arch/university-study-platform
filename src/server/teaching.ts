import type { Db } from "./db";
import type { Profile } from "@/lib/types";
import { audit, HttpError, requireAdmin } from "./auth";
export function requireStaff(u: Profile) {
  if (u.is_demo || !["professor", "admin"].includes(u.role))
    throw new HttpError(
      403,
      "Only assigned professors and administrators can manage classes.",
    );
}
export async function teachingScope(
  db: Db,
  u: Profile,
  group: string,
  subject: string,
) {
  requireStaff(u);
  if (group === "demo-group")
    throw new HttpError(403, "The demo class is reserved.");
  const valid = await db.query(
    "SELECT g.id FROM class_groups g JOIN subjects s ON s.semester_id=g.semester_id WHERE g.id=$1 AND s.id=$2",
    [group, subject],
  );
  if (!valid.rows.length)
    throw new HttpError(
      400,
      "Choose a subject in the selected group’s semester.",
    );
  if (
    u.role === "professor" &&
    !(
      await db.query(
        "SELECT 1 FROM teaching_assignments WHERE professor_id=$1 AND group_id=$2 AND subject_id=$3 FOR SHARE",
        [u.id, group, subject],
      )
    ).rows.length
  )
    throw new HttpError(403, "This teaching assignment is unavailable.");
}
export async function assignProfessor(
  db: Db,
  u: Profile,
  prof: string,
  group: string,
  subject: string,
  remove: boolean,
) {
  requireAdmin(u);
  return db.transaction(async (tx) => {
    await teachingScope(tx, u, group, subject);
    if (
      !(
        await tx.query(
          "SELECT id FROM users WHERE id=$1 AND role='professor' AND NOT is_demo FOR SHARE",
          [prof],
        )
      ).rows.length
    )
      throw new HttpError(400, "Choose a professor account.");
    const args = [prof, group, subject];
    const changed = remove
      ? await tx.query(
          "DELETE FROM teaching_assignments WHERE professor_id=$1 AND group_id=$2 AND subject_id=$3 RETURNING professor_id",
          args,
        )
      : await tx.query(
          "INSERT INTO teaching_assignments VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING professor_id",
          args,
        );
    if (changed.rows.length)
      await audit(
        tx,
        u.id,
        remove ? "assignment.revoked" : "assignment.granted",
        prof,
        { group, subject },
      );
  });
}
export async function scopes(db: Db, u: Profile) {
  requireStaff(u);
  return (
    await db.query<{
      group_id: string;
      subject_id: string;
      class_name: string;
      subject: string;
    }>(
      `SELECT g.id group_id,s.id subject_id,g.name class_name,s.name subject FROM class_groups g JOIN subjects s ON s.semester_id=g.semester_id WHERE g.id<>'demo-group' AND ($1 OR EXISTS(SELECT 1 FROM teaching_assignments a WHERE a.group_id=g.id AND a.subject_id=s.id AND a.professor_id=$2)) ORDER BY g.name,s.name,g.id,s.id`,
      [u.role === "admin", u.id],
    )
  ).rows;
}
