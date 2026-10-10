"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MAX_CONTROLS, addControl } from "@/lib/workflow/workspace.ts";
import { ControlForm } from "./ControlForm.tsx";
import { StepIndicator } from "./StepIndicator.tsx";
import { Notice } from "./ui.tsx";
import { saveNow, useWorkspace } from "./useWorkspace.ts";

export function NewControl() {
  const router = useRouter();
  const { ws } = useWorkspace();
  if (!ws) return <p className="text-sm text-slate-500">Loading…</p>;
  const full = ws.controls.length >= MAX_CONTROLS;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <StepIndicator current={1} confirmedCount={ws.controls.filter((c) => c.confirmed).length} />
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Enter your own control</h1>
        <p className="text-sm text-slate-600">
          The text is sent to the AI only when you ask for a suggestion on the next screen. It is treated as data, not instructions.
        </p>
      </header>
      {full ? (
        <Notice tone="warn">This tab already holds {MAX_CONTROLS} controls, the most it can keep.</Notice>
      ) : (
        <div className="rounded-lg border border-slate-200 p-4">
          <ControlForm
            submitLabel="Add and review"
            onAdd={(input) => {
              const r = addControl(ws, input, new Date().toISOString());
              if (!r.id) return;
              saveNow(r.ws);
              router.push(`/review?focus=${r.id}`);
            }}
          />
        </div>
      )}
      <Link href="/" className="text-sm text-slate-600 underline">Back</Link>
    </div>
  );
}
