"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { exerciseRequest } from "./exercise-entry";
import type { assess } from "@/server/personalisation";
type Topic = Omit<ReturnType<typeof assess>, "question">;
export function TopicCoach({
  subject,
  map = false,
}: {
  subject: string;
  map?: boolean;
}) {
  const [topics, setTopics] = useState<Topic[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    setTopics([]);
    setError("");
    fetch("/api/exercises?progress=" + encodeURIComponent(subject), {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!controller.signal.aborted) setTopics(d.topics);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [subject]);
  const next = topics[0];
  return (
    <section className="panel">
      <span className="eyebrow">
        {map ? "WEAKNESS MAP" : "RECOMMENDED NEXT"}
      </span>
      {next ? (
        <>
          <h2>{next.topic}</h2>
          <details>
            <summary>Why this?</summary>
            <p>{next.reason}</p>
          </details>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await exerciseRequest({
                  action: "adaptive",
                  subject,
                });
                router.push("/session/" + r.id);
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Preparing…" : "Practise weak areas"}
          </button>
          {map && (
            <>
              <p className="helper">
                Learning-progress estimates give recent answers more weight.
                Estimates move toward 50% as evidence ages.
              </p>
              {["Priority", "Needs practice", "Strong", "Unpractised"].map(
                (label) => {
                  const selected = topics.filter((t) => t.group === label);
                  return selected.length ? (
                    <div key={label}>
                      <h3>{label}</h3>
                      {selected.map((t) => (
                        <div key={t.lesson + t.topic}>
                          <strong>
                            {t.topic}
                            {t.score === null ? "" : " · " + t.score + "%"}
                          </strong>
                          {t.memory.map((m) => (
                            <p key={m.pattern}>
                              {m.pattern} · {m.count}{" "}
                              {m.count === 1 ? "occurrence" : "occurrences"} ·{" "}
                              {m.status}
                              {m.corrections
                                ? " · " +
                                  m.corrections +
                                  " exercises answered correctly since"
                                : ""}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null;
                },
              )}
            </>
          )}
        </>
      ) : (
        <p>{error || "Recommendations appear when questions are available."}</p>
      )}
      {next && error && <p role="alert">{error}</p>}
    </section>
  );
}
