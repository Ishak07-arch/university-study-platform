"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <h1>Your study space couldn’t load.</h1>
      <p>Please try again. Your saved progress is safe.</p>
      <button className="primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
