import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <span className="eyebrow">PAGE NOT FOUND</span>
      <h1>Let’s get you back on track.</h1>
      <p>This page isn’t part of your study space.</p>
      <Link href="/" className="primary">
        Back to Home
      </Link>
    </main>
  );
}
