"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Check, Eye, EyeOff, Leaf } from "lucide-react";
import { api } from "@/lib/api";
import { StudyIllustration } from "./ui";
export function AuthForm({
  mode,
  token,
}: {
  mode: "login" | "register" | "forgot" | "reset";
  token?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api<{ admin?: boolean }>(mode, {
        name,
        email,
        password,
        token,
      });
      if (mode === "forgot")
        setSuccess(
          "If an account exists, a reset link will be sent to your email. It will be valid for 30 minutes.",
        );
      else if (mode === "reset")
        setSuccess(
          "Your password has been updated. Sign in with your new password.",
        );
      else {
        router.push(res.admin ? "/admin" : "/");
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const title =
    mode === "register"
      ? "Your next chapter starts here."
      : mode === "forgot"
        ? "Let’s get you back in."
        : mode === "reset"
          ? "A fresh start."
          : "Good to have you back.";
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <BookOpen size={25} />
          </span>
          folio<span className="brand-dot">.</span>
        </Link>
        <div>
          <span className="eyebrow">YOUR STUDY COMPANION</span>
          <h1>
            A little progress.
            <br />
            Every single day.
          </h1>
          <p>
            Less figuring out what to study.
            <br />
            More “I’ve got this.”
          </p>
          <div className="auth-illustration">
            <StudyIllustration />
          </div>
        </div>
        <span className="auth-story-footer">
          <Leaf size={17} />
          Small steps. Big possibilities.
        </span>
      </aside>
      <main className="auth-content">
        <div className="auth-mobile-brand">
          <Link className="brand" href="/">
            folio.
          </Link>
        </div>
        <form onSubmit={submit} className="auth-form">
          <span className="eyebrow">
            {mode === "register"
              ? "MAKE YOURSELF AT HOME"
              : "YOUR QUIET CORNER TO LEARN"}
          </span>
          <h2>{title}</h2>
          <p>
            {mode === "register"
              ? "Just the essentials. Then you’re ready to study."
              : mode === "forgot"
                ? "Enter your email and we’ll send you a reset link."
                : mode === "reset"
                  ? "Choose a strong password you haven’t used before."
                  : "Sign in, pick up where you left off, and keep going."}
          </p>
          {success ? (
            <div className="auth-success" role="status">
              <Check size={24} />
              <p>{success}</p>
              <Link href="/sign-in" className="primary">
                Back to sign in
                <ArrowRight size={17} />
              </Link>
            </div>
          ) : (
            <>
              {mode === "register" && (
                <>
                  <label className="field-label" htmlFor="name">
                    Your name
                  </label>
                  <input
                    id="name"
                    autoComplete="name"
                    placeholder="Alex Johnson"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={60}
                  />
                </>
              )}
              {mode !== "reset" && (
                <>
                  <label className="field-label" htmlFor="email">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={254}
                  />
                </>
              )}
              {mode !== "forgot" && (
                <>
                  <div className="password-label">
                    <label className="field-label" htmlFor="password">
                      {mode === "reset" ? "New password" : "Password"}
                    </label>
                    {mode === "login" && (
                      <Link href="/forgot-password">Forgot password?</Link>
                    )}
                  </div>
                  <div className="password-input">
                    <input
                      id="password"
                      type={visible ? "text" : "password"}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      placeholder={
                        mode === "login"
                          ? "Your password"
                          : "At least 10 characters"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={mode === "login" ? 1 : 10}
                      maxLength={128}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setVisible(!visible)}
                      aria-label={visible ? "Hide password" : "Show password"}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary full-width" disabled={busy}>
                {busy
                  ? "One moment…"
                  : mode === "register"
                    ? "Create my account"
                    : mode === "forgot"
                      ? "Send reset link"
                      : mode === "reset"
                        ? "Save new password"
                        : "Sign in"}
                <ArrowRight size={17} />
              </button>
              {mode === "login" || mode === "register" ? (
                <>
                  <p className="auth-alternate">
                    {mode === "login"
                      ? "New to Folio?"
                      : "Already have an account?"}{" "}
                    <Link href={mode === "login" ? "/sign-up" : "/sign-in"}>
                      {mode === "login" ? "Create an account" : "Sign in"}
                    </Link>
                  </p>
                  <div className="auth-divider">
                    <span />
                    or take a look around
                    <span />
                  </div>
                  <Link href="/" className="secondary full-width">
                    Explore the demo
                    <ArrowRight size={17} />
                  </Link>
                </>
              ) : (
                <Link className="back-link" href="/sign-in">
                  Back to sign in
                </Link>
              )}
            </>
          )}
        </form>
        <p className="auth-bottom">
          Built for learning. Designed for breathing room.
        </p>
      </main>
    </div>
  );
}
