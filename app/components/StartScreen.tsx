"use client";

import Link from "next/link";
import { Legend, Notice } from "./ui.tsx";
import { useWorkspace } from "./useWorkspace.ts";

export function StartScreen() {
  const { ws, discarded } = useWorkspace();
  const count = ws?.controls.length ?? 0;
  const choice =
    "block rounded-xl border-2 border-slate-200 bg-white p-6 text-left transition hover:border-slate-900 hover:shadow-sm focus:border-slate-900 focus:outline-none";
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/samples" className={choice}>
          <p className="text-lg font-semibold text-slate-900">Choose sample controls</p>
          <p className="mt-1 text-sm text-slate-600">Pick any of the 14 PUC sample controls to review.</p>
        </Link>
        <Link href="/new" className={choice}>
          <p className="text-lg font-semibold text-slate-900">Enter your own control</p>
          <p className="mt-1 text-sm text-slate-600">Type a control name and description to map.</p>
        </Link>
      </div>

      {count > 0 && (
        <p className="text-sm">
          <Link href="/review" className="font-medium text-slate-900 underline">
            Continue reviewing ({count} control{count === 1 ? "" : "s"} in this tab)
          </Link>
        </p>
      )}

      <p className="text-xs text-slate-500">
        Your work is kept only in this browser tab and is deleted when you close it. There are no accounts and nothing you type is stored
        on the server.
      </p>
    </div>
  );
}
