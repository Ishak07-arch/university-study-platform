import { snapshot } from "@/server/data";
import { currentUser } from "@/server/auth";
import { redirect, notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ route?: string[] }>;
}) {
  const { route = [] } = await params;
  const section = route[0] || "home";
  if (
    !["home", "study", "progress", "leaderboard", "profile", "tasks"].includes(
      section,
    ) ||
    route.length > 2 ||
    (route.length === 2 && section !== "study")
  )
    notFound();
  const user = await currentUser();
  if (
    !user &&
    (section === "profile" ||
      (process.env.NODE_ENV === "production" &&
        process.env.ENABLE_DEMO !== "true"))
  )
    redirect("/sign-in");
  const data = await snapshot(user);
  if (
    section === "study" &&
    route[1] &&
    !data.subjects.some((s) => s.id === route[1])
  )
    notFound();
  return <AppShell initial={data} section={section} subjectId={route[1]} />;
}
