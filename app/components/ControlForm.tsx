"use client";

import { useState } from "react";
import { INPUT_LIMITS } from "@/lib/mapping/config.ts";
import type { ControlInput } from "@/lib/mapping/types.ts";
import { Button } from "./ui.tsx";

/** Intake form for one analyst-entered control. Name and description are required. */
export function ControlForm({ onAdd, submitLabel }: { onAdd: (input: ControlInput) => void; submitLabel: string }) {
  const [draft, setDraft] = useState<ControlInput>({ name: "", description: "" });
  const set = (k: keyof ControlInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft({ ...draft, [k]: e.target.value });
  const input = "mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900";
  const ready = draft.name.trim() && draft.description.trim();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        const clean = Object.fromEntries(
          Object.entries(draft)
            .map(([k, v]) => [k, (v ?? "").trim()])
            .filter(([, v]) => v),
        ) as ControlInput;
        onAdd(clean);
      }}
    >
      <label className="block text-sm font-medium text-slate-700">
        Control name *
        <input required value={draft.name} onChange={set("name")} maxLength={INPUT_LIMITS.name} className={input} />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Description *
        <span className="block text-xs font-normal text-slate-500">What the control does, in a sentence or two.</span>
        <textarea required rows={3} value={draft.description} onChange={set("description")} maxLength={INPUT_LIMITS.description} className={input} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Objective <span className="font-normal text-slate-500">(optional)</span>
          <textarea rows={2} value={draft.objective ?? ""} onChange={set("objective")} maxLength={INPUT_LIMITS.objective} className={input} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Activity <span className="font-normal text-slate-500">(optional)</span>
          <textarea rows={2} value={draft.activity ?? ""} onChange={set("activity")} maxLength={INPUT_LIMITS.activity} className={input} />
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700 sm:w-1/2">
        Owner <span className="font-normal text-slate-500">(optional)</span>
        <input value={draft.owner ?? ""} onChange={set("owner")} maxLength={INPUT_LIMITS.owner} className={input} />
      </label>
      <Button type="submit" variant="primary" disabled={!ready}>{submitLabel}</Button>
    </form>
  );
}
