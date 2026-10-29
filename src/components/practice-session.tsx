"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  Flag,
  Leaf,
  Lightbulb,
  RotateCcw,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import type { SessionPayload } from "@/lib/types";
import { api } from "@/lib/api";
import { ProgressBar, SubjectIcon } from "./ui";
import { TutorButton } from "./tutor-panel";
import { exerciseRequest } from "./exercise-entry";
import { useRouter } from "next/navigation";
export function PracticeSession({ initial }: { initial: SessionPayload }) {
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [written, setWritten] = useState("");
  const router = useRouter();
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    xp: number;
    explanation: string;
    mistake: string;
    repeated?: boolean;
  } | null>(
    initial.alreadyCorrect
      ? {
          correct: true,
          xp: 0,
          explanation:
            "You already solved this question. Ready for the next one?",
          mistake: "",
        }
      : null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [earned, setEarned] = useState(0);
  const [showNote, setShowNote] = useState(initial.session.mode === "review");
  const { session, question, subject } = data;
  const typed = question?.question_type && question.question_type !== "choice";
  async function check() {
    if (typed ? !written.trim() : selected === null) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<NonNullable<typeof feedback>>("answer", {
        session: session.id,
        question: question?.id,
        selected: typed ? written : selected,
      });
      setFeedback(result);
      setEarned((v) => v + result.xp);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function next() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ complete: boolean; xp: number }>("next", {
        session: session.id,
      });
      setEarned((v) => v + r.xp);
      const res = await fetch("/api/actions?session=" + session.id);
      if (!res.ok)
        throw new Error("Could not load your next question. Please try again.");
      const payload: SessionPayload = await res.json();
      setData(payload);
      setSelected(null);
      setWritten("");
      setFeedback(null);
      setExplanation("");
      setShowNote(payload.session.mode === "review");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function explain() {
    setBusy(true);
    try {
      const r = await api<{ explanation: string }>("explain", {
        session: session.id,
        question: question?.id,
      });
      setExplanation(r.explanation);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="session-page">
      <header className="session-header">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <BookOpen size={23} />
          </span>
          folio<span className="brand-dot">.</span>
        </Link>
        <Link href="/" className="session-save">
          <X size={18} />
          Save & close
        </Link>
      </header>
      {session.completed_at ? (
        <main className="session-complete">
          <div className="completion-icon">
            <Check size={40} />
          </div>
          <span className="eyebrow">ONE MORE SMALL WIN</span>
          <h1>
            A little more confident.
            <br />A little further along.
          </h1>
          <p>
            You worked through {session.question_ids.length}{" "}
            {subject.name.toLowerCase()} questions.
            <br />
            Take a breath. You’ve earned it.
          </p>
          {earned > 0 && (
            <div className="earned-badge">
              <Zap size={19} />
              {earned} XP earned this visit
            </div>
          )}
          <div className="completion-actions">
            <Link className="primary" href="/">
              Back to my day
              <ArrowRight size={17} />
            </Link>
            <Link className="secondary" href="/progress">
              See my progress
            </Link>
          </div>
          <small>Progress is saved. Come back whenever you’re ready.</small>
        </main>
      ) : (
        <main className="practice-main">
          <div className="practice-subject">
            <SubjectIcon subject={subject} small />
            <span>{subject.name}</span>
            <span className="tag">
              {session.mode === "review"
                ? "Quick review"
                : session.mode === "exam"
                  ? "Exam prep"
                  : "Practice"}
            </span>
          </div>
          <div className="question-progress-label">
            <span>
              Question {session.position + 1} of {session.question_ids.length}
            </span>
            <span>
              {earned > 0 ? (
                <>
                  <Zap size={13} />
                  {earned} XP earned
                </>
              ) : (
                "One question at a time"
              )}
            </span>
          </div>
          <ProgressBar
            value={(session.position / session.question_ids.length) * 100}
            label="Session progress"
          />
          <article className="question-card">
            <div className="question-topic">
              <span className="eyebrow">{question?.topic}</span>
              {question?.note && (
                <button
                  className="text-button"
                  onClick={() => setShowNote(!showNote)}
                >
                  <Lightbulb size={15} />
                  {showNote ? "Hide concept" : "Review concept"}
                </button>
              )}
            </div>
            {showNote && question?.note && (
              <div className="concept-note">
                <BookOpen size={20} />
                <p>{question?.note}</p>
              </div>
            )}
            <h1>{question?.prompt}</h1>
            {data.notice && (
              <p role="status" className="helper">
                {data.notice}
              </p>
            )}
            {question?.source && (
              <p className="exercise-source">
                Based on:{" "}
                <a href={`/api/content/${question.source.resourceId}`}>
                  {question.source.label}
                </a>
              </p>
            )}
            {typed ? (
              <label className="field-label">
                Your answer
                <input
                  value={written}
                  maxLength={500}
                  inputMode={
                    question?.question_type === "numeric" ? "decimal" : "text"
                  }
                  disabled={busy || !!feedback?.correct}
                  onChange={(e) => {
                    setWritten(e.target.value);
                    setFeedback(null);
                    setExplanation("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !busy && !feedback?.correct)
                      void check();
                  }}
                />
                <small className="helper">
                  {question?.question_type === "numeric"
                    ? "Enter a number without units or commas. Use the precision requested in the question."
                    : "Use the course term or a short phrase. Capitalisation and extra spaces do not matter."}
                </small>
              </label>
            ) : (
              <fieldset
                disabled={busy || !!feedback?.correct}
                className="answer-options"
              >
                <legend className="sr-only">Choose your answer</legend>
                {question?.options.map((option, i) => (
                  <label
                    key={i}
                    className={`answer-option ${selected === i ? "selected" : ""} ${feedback?.correct && selected === i ? "correct" : ""}`}
                  >
                    <input
                      type="radio"
                      name="answer"
                      value={i}
                      checked={selected === i}
                      onChange={() => {
                        setSelected(i);
                        setFeedback(null);
                        setExplanation("");
                      }}
                    />
                    <span className="option-letter">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span>{option}</span>
                    <span className="option-indicator">
                      {selected === i && <span />}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {feedback && (
              <div
                className={`answer-feedback ${feedback.correct ? "positive" : "retry"}`}
                role="status"
              >
                <span className="feedback-icon">
                  {feedback.correct ? (
                    <Check size={21} />
                  ) : (
                    <Lightbulb size={21} />
                  )}
                </span>
                <div>
                  <strong>
                    {feedback.correct
                      ? "That’s right. Nicely done!"
                      : "Almost. Let’s take another look."}
                    {feedback.xp > 0 && <span>+{feedback.xp} XP</span>}
                  </strong>
                  <p>
                    {feedback.correct
                      ? question?.origin === "seed"
                        ? feedback.explanation
                        : "Your answer is correct."
                      : feedback.mistake}
                  </p>
                  {feedback.repeated && (
                    <p>
                      You have made a similar mistake before. A little targeted
                      practice may help.
                    </p>
                  )}
                  {(!feedback.correct || question?.origin !== "seed") && (
                    <>
                      <button
                        className="text-button"
                        onClick={explain}
                        disabled={busy}
                      >
                        <CircleHelp size={15} />
                        Show me why
                      </button>
                      {explanation && (
                        <p className="expanded-explanation">{explanation}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="question-actions">
              <span>
                <Leaf size={15} />
                Mistakes are part of learning.
              </span>
              {feedback?.correct || !question ? (
                <button className="primary" onClick={next} disabled={busy}>
                  {busy
                    ? "Saving…"
                    : session.position + 1 === session.question_ids.length
                      ? "Finish session"
                      : "Next question"}
                  <ArrowRight size={17} />
                </button>
              ) : feedback ? (
                <button
                  className="primary"
                  onClick={() => {
                    setFeedback(null);
                    setSelected(null);
                    setWritten("");
                    setExplanation("");
                  }}
                >
                  <RotateCcw size={16} />
                  Try again
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={check}
                  disabled={
                    (typed ? !written.trim() : selected === null) || busy
                  }
                >
                  {busy ? "Checking…" : "Check answer"}
                  <ArrowRight size={17} />
                </button>
              )}
            </div>
            {question && (
              <TutorButton
                key={question.id}
                context={{ sessionId: session.id }}
              />
            )}
            {question?.similar && (
              <div className="lesson-practice">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const r = await exerciseRequest({
                        action: "similar",
                        sessionId: session.id,
                      });
                      if (r.id && r.id !== session.id)
                        router.push("/session/" + r.id);
                      else setError(r.message);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Generate Similar Exercise
                </button>
                <small className="helper">
                  Same concept and difficulty; variations share one XP reward.
                </small>
              </div>
            )}
            {error && (
              <button
                className="text-button"
                onClick={() => window.location.reload()}
              >
                Reload saved practice
              </button>
            )}
          </article>
          <p className="session-footnote">
            <Check size={13} />
            Your place is saved automatically. Pick up here anytime.
          </p>
        </main>
      )}
    </div>
  );
}
