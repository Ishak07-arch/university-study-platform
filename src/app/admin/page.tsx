import { currentUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import type { Subject } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "admin")
    return (
      <main className="standalone">
        <span className="eyebrow">ADMIN WORKSPACE</span>
        <h1>This space is for administrators.</h1>
        <p>Your learning workspace is ready for you.</p>
        <a className="primary" href="/">
          Return to Home
        </a>
      </main>
    );
  const db = await getDb();
  const subjects = (
    await db.query<Subject>("SELECT * FROM subjects ORDER BY name")
  ).rows;
  const groups = (
    await db.query<{ id: string; name: string }>(
      "SELECT id,name FROM class_groups WHERE id<>'demo-group' ORDER BY name",
    )
  ).rows;
  const semesters = (
    await db.query<{ id: string; name: string }>(
      "SELECT id,name FROM semesters",
    )
  ).rows;
  const tasks = (
    await db.query<{
      id: string;
      title: string;
      type: string;
      group_name: string;
      due_at: string;
    }>(
      `SELECT t.id,t.title,t.type,t.due_at,g.name group_name FROM tasks t JOIN class_groups g ON g.id=t.group_id WHERE t.group_id<>'demo-group' ORDER BY t.created_at DESC LIMIT 30`,
    )
  ).rows;
  const events = (
    await db.query<{
      id: string;
      name: string;
      amount: number;
      reason: string;
      created_at: string;
    }>(
      `SELECT e.id,u.name,e.amount,e.reason,e.created_at FROM xp_events e JOIN users u ON u.id=e.user_id WHERE u.is_demo=false ORDER BY e.created_at DESC LIMIT 20`,
    )
  ).rows;
  return (
    <AdminDashboard
      name={user.name}
      subjects={subjects}
      groups={groups}
      semesters={semesters}
      tasks={JSON.parse(JSON.stringify(tasks))}
      events={JSON.parse(JSON.stringify(events))}
    />
  );
}
