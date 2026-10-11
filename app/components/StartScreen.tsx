"use client";

import Link from "next/link";
import { Legend, LinkButton, Notice, buttonClass, cx } from "./ui.tsx";
import { useWorkspace } from "./useWorkspace.ts";

export function StartScreen() {
  const { ws, discarded } = useWorkspace();
  const count = ws?.controls.length ?? 0;
  // Each card is one link: the whole card is clickable, with a visible button inside, hover and focus styles.
  // Samples is the suggested start (green primary); your own control is the alternative (blue outline).
  const card =
    "group flex cursor-pointer flex-col justify-between gap-4 rounded-xl border-2 border-slate-200 bg-white p-6 text-left shadow-sm transition " +
    "hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
  const sampleCard = cx(card, "hover:border-emerald-600 hover:bg-emerald-50/40 focus-visible:border-emerald-600");
  const ownCard = cx(card, "hover:border-blue-600 hover:bg-blue-50/40 focus-visible:border-blue-600");
  const sampleButton = cx(buttonClass("primary", "lg"), "self-start group-hover:bg-emerald-700");
  const ownButton = cx(buttonClass("secondary", "lg"), "self-start group-hover:bg-blue-50");
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Control mapping and framework alignment</h1>
        <p className="text-slate-700">
          Map Pacific Utilities Corporation&apos;s (fictional) security controls to NIST CSF 2.0, ISO/IEC 27001:2022, CIS Controls v8.1 and
          SOC 2. The AI suggests a mapping, you review and confirm it, and code calculates the results.
        </p>
        <Legend />
      </header>

      {discarded && <Notice tone="warn">Saved data in this tab failed validation and was discarded. You are starting fresh.</Notice>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/samples" className={sampleCard} aria-label="Choose sample controls: pick any of the 14 PUC sample controls to review">
          <div>
            <p className="text-lg font-semibold text-slate-900">PUC sample controls</p>
            <p className="mt-1 text-sm text-slate-600">Pick any of the 14 sample controls to review.</p>
          </div>
          <span className={sampleButton} aria-hidden>
            Choose sample controls →
          </span>
        </Link>
        <Link href="/new" className={ownCard} aria-label="Enter your own control: type a control name and description to map">
          <div>
            <p className="text-lg font-semibold text-slate-900">Your own control</p>
            <p className="mt-1 text-sm text-slate-600">Type a control name and description to map.</p>
          </div>
          <span className={ownButton} aria-hidden>
            Enter your own control →
          </span>
        </Link>
      </div>

      {count > 0 && (
        <LinkButton href="/review">
          Continue reviewing ({count} control{count === 1 ? "" : "s"} in this tab) <span aria-hidden>→</span>
        </LinkButton>
      )}

      <p className="text-xs text-slate-500">
        Your work is kept only in this browser tab and is deleted when you close it. There are no accounts and nothing you type is stored
        on the server.
      </p>
    </div>
  );
}
