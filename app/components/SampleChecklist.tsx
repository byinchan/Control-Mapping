"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PUC_SAMPLES } from "@/lib/workflow/samples.ts";
import { MAX_CONTROLS, loadSample } from "@/lib/workflow/workspace.ts";
import { StepIndicator } from "./StepIndicator.tsx";
import { Button, StepFooter } from "./ui.tsx";
import { saveNow, useWorkspace } from "./useWorkspace.ts";

export function SampleChecklist() {
  const router = useRouter();
  const { ws } = useWorkspace();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  if (!ws) return <p className="text-sm text-slate-500">Loading…</p>;

  const already = new Set(ws.controls.map((c) => c.id));
  const available = PUC_SAMPLES.filter((s) => !already.has(s.id));
  const room = MAX_CONTROLS - ws.controls.length;
  const allSelected = available.length > 0 && available.every((s) => selected.has(s.id));
  const toggle = (id: string) =>
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const confirmedCount = ws.controls.filter((c) => c.confirmed).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <StepIndicator current={1} confirmedCount={confirmedCount} />
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Choose sample controls</h1>
        <p className="text-sm text-slate-600">
          The 14 sample controls from the PUC control set. Only the control text is loaded; you will get AI suggestions and decide the
          mapping on the next screen.
        </p>
      </header>

      <div className="rounded-lg border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={allSelected}
              disabled={available.length === 0}
              onChange={() => setSelected(allSelected ? new Set() : new Set(available.map((s) => s.id)))}
            />
            Select all
          </label>
          <span className="text-sm text-slate-700" aria-live="polite">
            {selected.size} of {available.length} selected
          </span>
        </div>
        <ul className="divide-y divide-slate-100">
          {PUC_SAMPLES.map((s) => {
            const added = already.has(s.id);
            return (
              <li key={s.id}>
                <label className={`flex items-start gap-3 px-3 py-2 ${added ? "text-slate-400" : "cursor-pointer hover:bg-slate-50"}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={added || selected.has(s.id)}
                    disabled={added}
                    onChange={() => toggle(s.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs">{s.id}</span> <span className="font-medium">{s.input.name}</span>
                    <span className="block text-xs text-slate-500">{s.input.description}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{added ? "already in review" : s.input.owner}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {selected.size > room && <p className="text-sm text-red-700">This tab can hold {room} more controls.</p>}
      <StepFooter back={{ href: "/", label: "Back" }}>
        {selected.size === 0 && <span className="text-xs text-slate-600">Select at least 1 control to continue.</span>}
        <Button
          variant="primary"
          size="lg"
          disabled={selected.size === 0 || selected.size > room}
          onClick={() => {
            const chosen = PUC_SAMPLES.filter((s) => selected.has(s.id));
            const next = loadSample(ws, chosen, new Date().toISOString());
            saveNow(next);
            router.push(`/review?focus=${chosen[0].id}`);
          }}
        >
          Continue with {selected.size} control{selected.size === 1 ? "" : "s"} <span aria-hidden>→</span>
        </Button>
      </StepFooter>
    </div>
  );
}
