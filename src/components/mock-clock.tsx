"use client";
import { useState, useEffect, useRef } from "react";
export function MockClock({ deadline }: { deadline: number }) {
  const [seconds, set] = useState<number | null>(null),
    button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function tick() {
      const n = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      set(n);
      if (!n && button.current) {
        button.current.click();
        button.current.disabled = true;
      }
    }
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [deadline]);
  return (
    <aside className="mock-clock">
      Time left ·{" "}
      {seconds === null
        ? "…"
        : Math.floor(seconds / 60) +
          ":" +
          String(seconds % 60).padStart(2, "0")}
      <button
        hidden
        ref={button}
        form="exam-answer"
        name="move"
        value="finish"
        formNoValidate
      >
        Time expired
      </button>
    </aside>
  );
}
