"use client";
import { useEffect, useRef, type ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Calculator,
  Globe2,
  TrendingUp,
  FunctionSquare,
  X,
} from "lucide-react";
import type { Subject } from "@/lib/types";
export function SubjectIcon({
  subject,
  small = false,
}: {
  subject: Pick<Subject, "icon" | "color">;
  small?: boolean;
}) {
  const Icon =
    (
      {
        chart: BarChart3,
        trend: TrendingUp,
        calculator: Calculator,
        globe: Globe2,
        function: FunctionSquare,
        book: BookOpen,
      } as const
    )[subject.icon as "chart"] || BookOpen;
  return (
    <span className={`subject-icon ${subject.color} ${small ? "small" : ""}`}>
      <Icon size={small ? 18 : 23} strokeWidth={1.8} />
    </span>
  );
}
export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label?: string;
}) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label || "Progress"}
    >
      <span style={{ width: Math.min(value, 100) + "%" }} />
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SectionHeading({
  title,
  action,
  href,
}: {
  title: string;
  action?: string;
  href?: string;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {action && (
        <a href={href}>
          {action}
          <ArrowUpRight size={15} />
        </a>
      )}
    </div>
  );
}
export function StudyIllustration() {
  return (
    <svg
      className="study-illustration"
      viewBox="0 0 340 260"
      aria-hidden="true"
    >
      <defs>
        <pattern id="grid" width="15" height="15" patternUnits="userSpaceOnUse">
          <path
            d="M 15 0 L 0 0 0 15"
            fill="none"
            stroke="#e4eae1"
            strokeWidth=".7"
          />
        </pattern>
        <filter id="shadow">
          <feDropShadow
            dx="0"
            dy="8"
            stdDeviation="8"
            floodColor="#204533"
            floodOpacity=".12"
          />
        </filter>
      </defs>
      <circle cx="192" cy="136" r="102" fill="#c5ddba" />
      <circle cx="287" cy="55" r="5" fill="#729c62" />
      <path
        d="M61 82h12m-6-6v12M282 181h16m-8-8v16"
        stroke="#83a573"
        strokeWidth="2"
      />
      <g transform="rotate(-10 170 140)" filter="url(#shadow)">
        <rect x="93" y="46" width="168" height="202" rx="9" fill="#537848" />
        <rect x="86" y="38" width="168" height="202" rx="8" fill="#fffef5" />
        <rect x="101" y="55" width="140" height="166" fill="url(#grid)" />
        <path
          d="M112 64h52M112 72h32"
          stroke="#648256"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M119 177v-76m0 76h105"
          fill="none"
          stroke="#51654a"
          strokeWidth="1.5"
        />
        <path
          d="M127 160c15 0 14-28 31-28s14 14 27-3 17-20 34-27"
          fill="none"
          stroke="#558647"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="158" cy="132" r="4" fill="#558647" />
        <circle cx="194" cy="119" r="4" fill="#558647" />
        <path
          d="M126 195h77m-77 10h52"
          stroke="#c6cfba"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M89 65h9m-9 25h9m-9 25h9m-9 25h9m-9 25h9m-9 25h9m-9 25h9"
          stroke="#8aa07e"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <g transform="rotate(25 265 145)">
        <rect x="261" y="81" width="10" height="124" rx="2" fill="#d7ad67" />
        <path d="M261 205l5 17 5-17" fill="#f4e2ba" />
        <path d="M264 215l2 7 2-7" fill="#344d35" />
        <path d="M264 83v119" stroke="#f4cf91" strokeWidth="2" />
        <rect x="261" y="72" width="10" height="13" rx="3" fill="#304b36" />
      </g>
      <g transform="translate(58 182) rotate(-15)">
        <rect x="-22" y="-22" width="44" height="44" rx="14" fill="#f8fbef" />
        <path
          d="m-10 0 7 7 15-16"
          stroke="#4a7b3b"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
