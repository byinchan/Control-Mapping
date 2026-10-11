"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ID_INDEX } from "@/lib/catalog/catalogs.ts";
import type { FrameworkId } from "@/lib/catalog/types.ts";
import {
  applyAiResult,
  confirmControl,
  controlStatus,
  editControlText,
  editFramework,
  emptyWorkspace,
  findControl,
  nextAwaitingId,
  removeControl,
  reopenControl,
  type ControlRecord,
  type ControlStatus,
  type FrameworkPatch,
} from "@/lib/workflow/workspace.ts";
import { requestMapping } from "./mappingClient.ts";
import { AI_LABELS } from "./labels.ts";
import { ReviewPanel } from "./ReviewPanel.tsx";
import { StepIndicator } from "./StepIndicator.tsx";
import { Button, Legend, LinkButton, Notice, RatingKey, TextLink, cx } from "./ui.tsx";
import { useWorkspace } from "./useWorkspace.ts";

const now = () => new Date().toISOString();

const DOT: Record<ControlStatus, string> = {
  draft: "bg-slate-300",
  "awaiting-review": "bg-amber-400",
  confirmed: "bg-emerald-600",
};

/** What happened in one batch AI run (AI_LABELS.mapAll), for a plain-language summary. */
type BatchReport = {
  total: number;
  done: number;
  running: boolean;
  live: number;
  demo: number;
  limitDemo: number;
  limitSkipped: string[];
  failed: string[];
};

function BatchSummary({ r }: { r: BatchReport }) {
  if (r.running) return <Notice tone="info">Asking the AI… {r.done} of {r.total}</Notice>;
  const limited = r.limitDemo > 0 || r.limitSkipped.length > 0;
  if (limited) {
    return (
      <Notice tone="warn" title="You've reached the AI suggestion limit for now">
        <p>
          To keep this public demo affordable, each visitor gets a limited number of AI suggestions every few minutes. Nothing you entered
          was lost.
        </p>
        <ul className="mt-1 list-disc pl-4">
          {r.live > 0 && <li>{r.live} control{r.live === 1 ? "" : "s"} got a live AI suggestion.</li>}
          {r.limitDemo > 0 && (
            <li>
              {r.limitDemo} sample control{r.limitDemo === 1 ? "" : "s"} got a saved demo suggestion instead (marked &ldquo;Demo mode&rdquo;).
            </li>
          )}
          {r.limitSkipped.length > 0 && (
            <li>
              Not sent yet: {r.limitSkipped.join(", ")}. Wait a few minutes and use &ldquo;{AI_LABELS.mapOne}&rdquo;, or map{" "}
              {r.limitSkipped.length === 1 ? "it" : "them"} by hand.
            </li>
          )}
        </ul>
      </Notice>
    );
  }
  if (r.failed.length > 0) {
    return (
      <Notice tone="warn" title={`${r.total - r.failed.length} of ${r.total} got a suggestion`}>
        No suggestion for {r.failed.join(", ")}. Open {r.failed.length === 1 ? "it" : "each one"} to see why, try again, or map by hand.
      </Notice>
    );
  }
  return (
    <Notice tone="ok">
      {r.total} suggestion{r.total === 1 ? "" : "s"} ready{r.demo > 0 ? ` (${r.demo} from saved demo output)` : ""}. Nothing counts until you
      confirm each control.
    </Notice>
  );
}

export function ReviewScreen() {
  const params = useSearchParams();
  const { ws, setWs, change, discarded, storageOk } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [triedConfirm, setTriedConfirm] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<BatchReport | null>(null);

  // Select the control named in ?focus=, or the first one, once the workspace has loaded.
  useEffect(() => {
    if (!ws || selectedId) return;
    const focus = params.get("focus");
    setSelectedId(focus && findControl(ws, focus) ? focus : (ws.controls[0]?.id ?? null));
  }, [ws, params, selectedId]);

  const runOne = useCallback(
    async (record: ControlRecord, keepEdited = false) => {
      setBusy((b) => new Set(b).add(record.id));
      setErrors(({ [record.id]: _, ...rest }) => rest);
      const result = await requestMapping(record);
      setBusy((b) => {
        const n = new Set(b);
        n.delete(record.id);
        return n;
      });
      if (result.ok) change((w) => applyAiResult(w, record.id, result.ai, now(), keepEdited));
      else setErrors((e) => ({ ...e, [record.id]: result.error }));
      return result;
    },
    [change],
  );

  const counts = useMemo(() => {
    const c = { confirmed: 0, "awaiting-review": 0, draft: 0 };
    for (const r of ws?.controls ?? []) c[controlStatus(r)] += 1;
    return c;
  }, [ws]);

  if (!ws) return <p className="text-sm text-slate-500">Loading this tab&apos;s workspace…</p>;

  if (ws.controls.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <StepIndicator current={2} confirmedCount={0} />
        {discarded && <Notice tone="warn">Saved data in this tab failed validation and was discarded.</Notice>}
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <p className="text-slate-700">There are no controls in this tab yet.</p>
          <p className="mt-2 text-sm">
            <TextLink href="/samples">Choose sample controls</TextLink> or <TextLink href="/new">enter your own control</TextLink>.
          </p>
        </div>
      </div>
    );
  }

  const selected = selectedId ? findControl(ws, selectedId) : null;
  const nextId = selected ? nextAwaitingId(ws, selected.id) : null;
  // Open a control and start at the top of its review panel.
  const openControl = (id: string) => {
    setSelectedId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const toSuggest = ws.controls.filter((r) => !r.ai && !r.confirmed);

  const suggestAll = async () => {
    const report: BatchReport = { total: toSuggest.length, done: 0, running: true, live: 0, demo: 0, limitDemo: 0, limitSkipped: [], failed: [] };
    setBatch({ ...report });
    for (const record of toSuggest) {
      const res = await runOne(record);
      report.done += 1;
      if (res.ok) {
        if (res.ai.mode === "demo") report.demo += 1;
        else report.live += 1;
        if (res.demoReason === "rate-limited") report.limitDemo += 1;
      } else if (res.code === "rate-limited") report.limitSkipped.push(record.id);
      else report.failed.push(record.id);
      setBatch({ ...report });
    }
    report.running = false;
    setBatch({ ...report });
  };

  return (
    <div className="space-y-4">
      <StepIndicator current={2} confirmedCount={counts.confirmed} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Review and confirm</h1>
        <Legend />
      </div>
      <RatingKey />
      {discarded && <Notice tone="warn">Saved data in this tab failed validation and was discarded.</Notice>}
      {!storageOk && <Notice tone="warn">This browser blocked tab storage, so your work will be lost if the page reloads.</Notice>}

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-600">
              <span className="font-semibold text-slate-900">{counts.confirmed}</span> confirmed ·{" "}
              <span className="font-semibold text-slate-900">{counts["awaiting-review"] + counts.draft}</span> awaiting review
            </p>
            <ul className="mt-2 max-h-[22rem] space-y-0.5 overflow-auto">
              {ws.controls.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    aria-current={r.id === selectedId}
                    title={r.current.name}
                    className={cx(
                      "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm",
                      r.id === selectedId ? "bg-blue-600 text-white" : "hover:bg-blue-50",
                    )}
                  >
                    <span className={cx("h-2 w-2 shrink-0 rounded-full", busy.has(r.id) ? "animate-pulse bg-violet-500" : DOT[controlStatus(r)])} />
                    <span className="font-mono text-xs opacity-70">{r.id}</span>
                    <span className="min-w-0 truncate">{r.current.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-300" />not mapped</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />awaiting review</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-600" />confirmed</span>
            </p>
          </div>
          {toSuggest.length > 0 && (
            <div>
              <Button variant="ai" className="w-full" disabled={busy.size > 0} onClick={suggestAll}>
                {AI_LABELS.mapAll}
              </Button>
              <p className="mt-1 text-xs text-slate-600">
                The AI fills in all four frameworks for each control. You review and edit everything before confirming.
              </p>
            </div>
          )}
          {batch && <BatchSummary r={batch} />}
          {counts.confirmed > 0 && (
            <LinkButton href="/matrix" className="w-full">
              See matrix &amp; gaps ({counts.confirmed} confirmed)
            </LinkButton>
          )}
          <LinkButton href="/" className="w-full">
            + Add controls
          </LinkButton>
          <button
            type="button"
            className="w-full text-xs text-red-700 underline"
            onClick={() => {
              if (!window.confirm("Clear every control in this tab? This cannot be undone.")) return;
              setWs(emptyWorkspace());
              setSelectedId(null);
              setBatch(null);
            }}
          >
            Clear this tab
          </button>
        </aside>

        <div className="min-w-0">
          {selected ? (
            <ReviewPanel
              key={selected.id}
              record={selected}
              aiBusy={busy.has(selected.id)}
              aiError={errors[selected.id] ?? null}
              showBlockers={triedConfirm.has(selected.id)}
              onEditText={(field, value) => change((w) => editControlText(w, selected.id, field, value, now()))}
              onRunAi={(keepEdited) => void runOne(selected, keepEdited)}
              onPatch={(f: FrameworkId, patch: FrameworkPatch) => {
                change((w) => editFramework(w, selected.id, f, patch, now()));
              }}
              onConfirm={(next) => {
                const res = confirmControl(ws, selected.id, ID_INDEX, now());
                setTriedConfirm((s) => new Set(s).add(selected.id));
                if (res.blockers.length > 0) return;
                setWs(res.ws);
                const target = next ? nextAwaitingId(res.ws, selected.id) : null;
                if (target) openControl(target);
              }}
              onNext={nextId ? () => openControl(nextId) : null}
              confirmedCount={counts.confirmed}
              onReopen={() => change((w) => reopenControl(w, selected.id, now()))}
              onRemove={() => {
                if (!window.confirm(`Remove ${selected.id} from this tab?`)) return;
                change((w) => removeControl(w, selected.id));
                setSelectedId(ws.controls.find((c) => c.id !== selected.id)?.id ?? null);
              }}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Select a control.</div>
          )}
        </div>
      </div>
    </div>
  );
}
