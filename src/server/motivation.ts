import type { Db } from "./db";
import type { Profile, Leader } from "@/lib/types";
const week = "(date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')";
export async function periodLeaders(
  db: Db,
  user: Profile,
  period: "week" | "month",
) {
  if (user.is_demo) return [];
  return (
    await db.query<Leader>(
      `WITH totals AS (
 SELECT u.id,u.name,coalesce(sum(x.amount),0)::int xp FROM users u LEFT JOIN xp_events x ON x.user_id=u.id AND x.created_at>=date_trunc('${period}',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
 WHERE u.group_id=$2 AND NOT u.is_demo AND u.role='student' GROUP BY u.id),
 ranked AS (SELECT *,rank() OVER(ORDER BY xp DESC)::int rank,row_number() OVER(ORDER BY xp DESC,name,id) pos FROM totals)
 SELECT pos::text id,name,rank,xp,0 streak,(id=$1) is_you FROM ranked WHERE pos<=20 OR id=$1 ORDER BY pos`,
      [user.id, user.group_id],
    )
  ).rows;
}
export async function motivation(db: Db, u: Profile) {
  // A topic becomes demonstrated once two distinct families were solved correctly
  // on first exposure. Past failures cannot lower a baseline or earn later credit.
  const improved = u.is_demo
    ? []
    : (
        await db.query<{ name: string; rank: number; is_you: boolean }>(
          `WITH coverage AS (
 SELECT f.user_id,f.lesson_id,f.topic,count(*) FILTER(WHERE seen_at<${week}) prior,count(*) FILTER(WHERE seen_at>=${week}) fresh
 FROM first_exposures f JOIN users u ON u.id=f.user_id WHERE u.group_id=$2 AND NOT u.is_demo AND u.role='student' AND f.correct
 GROUP BY f.user_id,f.lesson_id,f.topic), growth AS (
 SELECT user_id,least(5,count(*) FILTER(WHERE prior<2 AND prior+fresh>=2)) gain FROM coverage GROUP BY user_id
 HAVING sum(prior)>=3 AND sum(fresh)>=4), ranked AS (
 SELECT u.name,u.id,rank() OVER(ORDER BY gain DESC)::int rank,row_number() OVER(ORDER BY gain DESC,u.name,u.id) pos
 FROM growth JOIN users u ON u.id=user_id WHERE gain>0)
 SELECT name,rank,(id=$1) is_you FROM ranked WHERE pos<=20 OR id=$1 ORDER BY pos`,
          [u.id, u.group_id],
        )
      ).rows;
  const badges = (
    await db.query<{ name: string }>(
      "SELECT a.name FROM achievements a JOIN user_achievements b ON b.achievement_id=a.id WHERE b.user_id=$1 ORDER BY b.earned_at,a.id",
      [u.id],
    )
  ).rows;
  const progress = (
    await db.query<{ solved: number; days: number }>(
      "SELECT solved,cardinality(days) days FROM weekly_learning WHERE user_id=$1 AND week=date_trunc('week',now() AT TIME ZONE 'UTC')::date",
      [u.id],
    )
  ).rows[0] ?? { solved: 0, days: 0 };
  return { improved, badges, progress };
}
