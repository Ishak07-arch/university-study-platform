"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { dailyStudy } from "@/server/study-plan";
import { fitPlan, timeOptions, type PlanItem } from "@/lib/study-plan";
import { exerciseRequest } from "./exercise-entry";
import { useStudy } from "./app-shell";

type Signals = Awaited<ReturnType<typeof dailyStudy>>;
export function DailyStudy() {
  const { data, openTask } = useStudy(),
    router = useRouter();
  const [signals, setSignals] = useState<Signals | null>(null),
    [minutes, setMinutes] = useState(10),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tracked, setTracked] = useState<{ key: string; minutes: number }[]>([]);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: data.profile.timezone,
  }).format(new Date());
  const key = "folio-plan/" + data.profile.id + "/" + today;
  const taskRevision = data.tasks
    .map((t) => [t.id, t.completed, t.due_at, t.importance, t.title].join(":"))
    .join("|");
  useEffect(() => {
    try {
      setTracked(
        JSON.parse(localStorage.getItem(key) || "[]").filter(
          (x: { minutes: number }) => Number.isFinite(x.minutes),
        ),
      );
      const m = Number(
        localStorage.getItem("folio-minutes/" + data.profile.id),
      );
      if (timeOptions.some((n) => n === m)) setMinutes(m);
    } catch {}
  }, [key, data.profile.id]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/study-plan", { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!controller.signal.aborted) {
          setSignals(d);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [key, taskRevision, data.active?.id, data.active?.position, data.xp]);
  const done = new Set(signals?.completedKeys ?? []);
  signals?.items.forEach((i) => {
    if (i.done) done.add(i.key);
  });
  const completed = tracked.filter((i) => done.has(i.key));
  const remaining = Math.max(
    0,
    minutes - completed.reduce((n, i) => n + i.minutes, 0),
  );
  const plan = fitPlan(signals?.items ?? [], remaining),
    next = plan[0];
  async function run(item: PlanItem) {
    setBusy(true);
    setError("");
    try {
      if (item.kind === "task") {
        const t = data.tasks.find((t) => t.id === item.id);
        if (!t) throw Error("Refresh Home to see the updated task.");
        openTask(t);
      } else if (item.kind === "resume") router.push("/session/" + item.id);
      else if (item.kind === "exam") router.push("/mock/" + item.id);
      else if (item.kind === "cards")
        router.push("/prep/" + encodeURIComponent(item.subject) + "#cards");
      else {
        const r = await exerciseRequest({
          action: "adaptive",
          subject: item.subject,
          target: {
            lesson: item.lesson,
            topic: item.topic,
            count: Math.max(1, Math.floor(item.minutes / 5)),
          },
        });
        router.push("/session/" + r.id);
      }
      const ids = [
        ...completed,
        ...plan.map(({ key, minutes }) => ({ key, minutes })),
      ];
      setTracked(ids);
      try {
        localStorage.setItem(key, JSON.stringify(ids));
      } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <span className="eyebrow">TODAY’S STUDY PLAN</span>
      <label className="field-label">
        Time available
        <select
          value={minutes}
          onChange={(e) => {
            const m = Number(e.target.value);
            setMinutes(m);
            try {
              localStorage.setItem(
                "folio-minutes/" + data.profile.id,
                String(m),
              );
            } catch {}
          }}
        >
          {timeOptions.map((n) => (
            <option key={n} value={n}>
              {n} minutes
            </option>
          ))}
        </select>
      </label>
      {signals?.nearest && (
        <p>
          <Link href={"/prep/" + signals.nearest.subject}>
            {signals.nearest.title} ·{" "}
            {signals.nearest.days === 0
              ? "Today"
              : `in ${signals.nearest.days} days`}
          </Link>
        </p>
      )}
      {next ? (
        <>
          <h2>{next.title}</h2>
          <p>
            {next.kind === "practice"
              ? `${Math.max(1, Math.floor(next.minutes / 5))} practice ${next.minutes >= 10 ? "exercises" : "exercise"} · about ${next.minutes} minutes`
              : `Spend about ${next.minutes} minutes on this step.`}
          </p>
          <details>
            <summary>Why this?</summary>
            <p>{next.reason}</p>
          </details>
          <button className="primary" disabled={busy} onClick={() => run(next)}>
            {next.kind === "resume"
              ? "Continue where I stopped"
              : tracked.length
                ? "Start next step"
                : "Start today’s plan"}
          </button>
          {plan.length > 1 && (
            <details>
              <summary>Next · {plan.length - 1} more steps</summary>
              <ol>
                {plan.slice(1).map((i) => (
                  <li key={i.key}>
                    {i.title} · {i.minutes} min
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      ) : (
        <p>
          {signals
            ? "You’re caught up for today."
            : error
              ? "Your plan is unavailable."
              : "Preparing your plan…"}
        </p>
      )}
      {tracked.length > 0 && (
        <small>
          {completed.length} of {tracked.length} planned steps completed today
        </small>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
