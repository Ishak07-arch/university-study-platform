"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db";
import { requireUser, signOut, HttpError, rateLimit } from "@/server/auth";
import { assignProfessor } from "@/server/teaching";
import { createReminder } from "@/server/tasks";
import {
  createChallenge,
  reviewSubmission,
  participate,
} from "@/server/challenges";
export async function staffAction(
  group: string,
  subject: string,
  action: string,
  form: FormData,
) {
  const path =
    "/professor?group=" +
    encodeURIComponent(group) +
    "&subject=" +
    encodeURIComponent(subject);
  const value = (name: string) => String(form.get(name) ?? "");
  try {
    const u = await requireUser("account"),
      db = await getDb();
    await rateLimit("staff:" + u.id, 60);
    if (action === "assign" || action === "remove")
      await assignProfessor(
        db,
        u,
        value("professor"),
        group,
        subject,
        action === "remove",
      );
    else if (action === "review")
      await reviewSubmission(
        db,
        u,
        value("challenge"),
        value("student"),
        z.enum(["approve", "reject"]).parse(value("decision")) === "approve",
        value("note"),
      );
    else {
      const title = z.string().trim().min(3).max(120).parse(value("title")),
        instructions = z.string().max(2000).parse(value("instructions"));
      const raw = value("deadline");
      if (
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(raw) ||
        !Number.isFinite(Date.parse(raw + "Z"))
      )
        throw new HttpError(400, "Enter a valid UTC deadline.");
      const deadline = new Date(raw + "Z").toISOString();
      if (action === "task")
        await createReminder(db, u, {
          group_id: group,
          subject_id: subject,
          title,
          description: instructions,
          due_at: deadline,
          type: z
            .enum([
              "HOMEWORK",
              "PRINT",
              "BRING",
              "EXAM",
              "QUIZ",
              "ANNOUNCEMENT",
              "CLASS_PREPARATION",
            ])
            .parse(value("type")),
          importance: 1,
        });
      else if (action === "challenge")
        await createChallenge(db, u, {
          group,
          subject,
          title,
          instructions,
          deadline,
          question: value("question") || null,
          xp: Number(value("xp")),
          academic: form.get("academic") === "on",
        });
      else throw new HttpError(400, "Unknown action.");
    }
  } catch (e) {
    if (e instanceof HttpError || e instanceof z.ZodError)
      redirect(
        path +
          "&message=" +
          encodeURIComponent(
            e instanceof HttpError ? e.message : "Check the form fields.",
          ),
      );
    throw e;
  }
  revalidatePath("/professor");
  revalidatePath("/challenges");
  redirect(path + "&message=Saved");
}
export async function studentAction(id: string, form: FormData) {
  let session: string | null;
  try {
    const u = await requireUser();
    await rateLimit("challenge:" + u.id, 40);
    session = await participate(
      await getDb(),
      u,
      id,
      String(form.get("response") ?? ""),
    );
  } catch (e) {
    if (e instanceof HttpError || e instanceof z.ZodError)
      redirect(
        "/challenges?message=" +
          encodeURIComponent(
            e instanceof HttpError
              ? e.message
              : "Write a response of 5–3000 characters.",
          ),
      );
    throw e;
  }
  revalidatePath("/challenges");
  redirect(session ? "/session/" + session : "/challenges?message=Submitted");
}

export async function staffLogout() {
  await signOut();
  redirect("/sign-in");
}
