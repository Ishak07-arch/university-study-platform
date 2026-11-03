"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, HttpError } from "@/server/auth";
import { getDb } from "@/server/db";
import { startMock, rateCard, updateMock } from "@/server/exam-prep";
export async function begin(subject: string, form: FormData) {
  let id: string;
  try {
    id = await startMock(
      await getDb(),
      await requireUser(),
      subject,
      Number(form.get("count")),
      Number(form.get("minutes")),
    );
  } catch (e) {
    if (e instanceof HttpError)
      redirect(
        "/prep/" +
          encodeURIComponent(subject) +
          "?message=" +
          encodeURIComponent(e.message),
      );
    throw e;
  }
  revalidatePath("/prep/" + encodeURIComponent(subject));
  redirect("/mock/" + id);
}
export async function reviewCard(subject: string, id: string, form: FormData) {
  await rateCard(
    await getDb(),
    await requireUser(),
    subject,
    id,
    String(form.get("rating")),
  );
  revalidatePath("/prep/" + encodeURIComponent(subject));
}
export async function respond(
  id: string,
  question: string | null,
  choice: boolean,
  index: number,
  form: FormData,
) {
  const action = form.get("move"),
    raw = form.get("answer"),
    input = choice ? Number(raw) : raw;
  let done = false;
  try {
    done = await updateMock(
      await getDb(),
      await requireUser(),
      id,
      action === "finish",
      raw !== null && raw !== "" && question ? question : undefined,
      input,
    );
  } catch (e) {
    if (e instanceof HttpError)
      redirect(
        "/mock/" +
          encodeURIComponent(id) +
          "?n=" +
          index +
          "&message=" +
          encodeURIComponent(e.message),
      );
    throw e;
  }
  revalidatePath("/mock/" + encodeURIComponent(id));
  redirect(
    "/mock/" +
      encodeURIComponent(id) +
      (done ? "" : "?n=" + Math.max(0, index + (action === "back" ? -1 : 1))),
  );
}
