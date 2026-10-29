"use client";
import { Printer } from "lucide-react";
export function PrintButton() {
  return (
    <button className="secondary" onClick={() => window.print()}>
      <Printer size={17} />
      Print worksheet
    </button>
  );
}
