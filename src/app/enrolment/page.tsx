import { redirect } from "next/navigation";
import { currentUser, signOut } from "@/server/auth";
export default async function Enrolment() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (user.group_id !== null) redirect("/");
  async function logout() {
    "use server";
    await signOut();
    redirect("/sign-in");
  }
  return (
    <main className="standalone">
      <h1>Waiting for class approval</h1>
      <p>
        Your account is ready. Your administrator needs to confirm your class
        before you can start studying.
      </p>
      <a className="primary" href="/">
        Check approval status
      </a>
      <form action={logout}>
        <button className="text-button">Sign out</button>
      </form>
    </main>
  );
}
