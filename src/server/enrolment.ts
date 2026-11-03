import type { Db } from "./db";
import type { Profile } from "@/lib/types";
import { requireAdmin, audit, HttpError } from "./auth";
export async function approveEnrolment(
  db: Db,
  actor: Profile,
  email: string,
  group: string,
) {
  requireAdmin(actor);
  await db.transaction(async (tx) => {
    const assigned = await tx.query<{ id: string }>(
      `UPDATE users SET group_id=$2 WHERE email=$1 AND role='student' AND NOT is_demo AND group_id IS NULL
 AND EXISTS(SELECT 1 FROM class_groups WHERE id=$2 AND id<>'demo-group') RETURNING id`,
      [email.trim().toLowerCase(), group],
    );
    if (!assigned.rows.length)
      throw new HttpError(
        409,
        "Choose a pending student and a valid student class.",
      );
    await audit(tx, actor.id, "enrolment.approved", assigned.rows[0].id, {
      group,
    });
  });
}
