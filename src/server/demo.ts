import type { Db } from "./db";
import { HttpError } from "./auth";

// Anonymous demo accounts are disposable. They expire after a day and the total
// is bounded so public previews cannot grow the database without limit.
export const DEMO_TTL_HOURS = 24;
export const DEMO_ACCOUNT_LIMIT = 500;

// Child rows first. Only rows owned by is_demo accounts are ever selected.
const ownedRows = [
  "DELETE FROM mock_items WHERE exam_id IN (SELECT id FROM mock_exams WHERE user_id=ANY($1::text[]))",
  "DELETE FROM mock_exams WHERE user_id=ANY($1::text[])",
  "DELETE FROM xp_events WHERE user_id=ANY($1::text[])",
  "DELETE FROM question_attempts WHERE user_id=ANY($1::text[])",
  "DELETE FROM task_completions WHERE user_id=ANY($1::text[])",
  "DELETE FROM study_days WHERE user_id=ANY($1::text[])",
  "DELETE FROM topic_mastery WHERE user_id=ANY($1::text[])",
  "DELETE FROM mistakes WHERE user_id=ANY($1::text[])",
  "DELETE FROM user_achievements WHERE user_id=ANY($1::text[])",
  "DELETE FROM card_reviews WHERE user_id=ANY($1::text[])",
  "DELETE FROM first_exposures WHERE user_id=ANY($1::text[])",
  "DELETE FROM weekly_learning WHERE user_id=ANY($1::text[])",
  "DELETE FROM challenge_submissions WHERE student_id=ANY($1::text[])",
  "DELETE FROM academic_rewards WHERE user_id=ANY($1::text[])",
  "DELETE FROM study_sessions WHERE user_id=ANY($1::text[])",
];

// Removes a bounded batch of expired demo accounts and everything they own.
// Any unexpected reference (for example an audit record) aborts the whole
// batch, so a failure never leaves a partially deleted account behind.
export async function purgeExpiredDemoUsers(
  db: Db,
  batch = 50,
  ttlHours = DEMO_TTL_HOURS,
) {
  try {
    return await db.transaction(async (tx) => {
      const ids = (
        await tx.query<{ id: string }>(
          "SELECT id FROM users WHERE is_demo=true AND created_at<now()-$1::int*interval '1 hour' ORDER BY created_at LIMIT $2 FOR UPDATE",
          [ttlHours, batch],
        )
      ).rows.map((r) => r.id);
      if (!ids.length) return 0;
      for (const sql of ownedRows) await tx.query(sql, [ids]);
      const removed = await tx.query(
        "DELETE FROM users WHERE id=ANY($1::text[]) AND is_demo=true RETURNING id",
        [ids],
      );
      return removed.rows.length;
    });
  } catch (error) {
    console.error(
      "Demo cleanup skipped:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return 0;
  }
}

export async function assertDemoCapacity(db: Db, limit = DEMO_ACCOUNT_LIMIT) {
  const { n } = (
    await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM users WHERE is_demo=true",
    )
  ).rows[0];
  if (n >= limit)
    throw new HttpError(
      503,
      "The demo is busy right now. Please try again later or create an account.",
    );
}
