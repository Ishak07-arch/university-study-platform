import { currentUser } from "@/server/auth";
import { sessionData } from "@/server/data";
import { redirect, notFound } from "next/navigation";
import { PracticeSession } from "@/components/practice-session";
export const dynamic = "force-dynamic";
export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (user.role === "professor") redirect("/professor");
  const { id } = await params;
  const data = await sessionData(user, id);
  if (!data) notFound();
  return <PracticeSession key={id} initial={data} />;
}
