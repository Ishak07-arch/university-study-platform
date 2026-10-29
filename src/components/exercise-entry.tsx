"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export async function exerciseRequest(body: unknown) {
  const res = await fetch("/api/exercises", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Practice is unavailable. Please try again.");
  return data;
}
export function LessonPractice({ lessonId }: { lessonId: string }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <div className="lesson-practice">
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const r = await exerciseRequest({ action: "practice", lessonId });
            if (r.id) router.push("/session/" + r.id);
            else setMessage(r.message);
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparing practice…" : "Practise this lesson"}
      </button>
      <small className="helper">
        Uses saved questions or published course excerpts. New generation may
        take a few seconds.
      </small>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
