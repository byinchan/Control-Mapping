"use client";

import { FRAMEWORK_IDS, type FrameworkId } from "@/lib/catalog/types.ts";
import { INPUT_LIMITS } from "@/lib/mapping/config.ts";
import type { ControlInput } from "@/lib/mapping/types.ts";
import { RATING_LABELS } from "@/lib/scoring/config.ts";
import { formatScore, scoreControl } from "@/lib/scoring/score.ts";
import {
  aiIsStale,
  confirmedRatings,
  controlStatus,
  textEdited,
  type ControlRecord,
  type FrameworkPatch,
} from "@/lib/workflow/workspace.ts";
import { FrameworkEditor } from "./FrameworkEditor.tsx";
import { Button, ControlStatusBadge, FRAMEWORK_NAMES, ModeBadge, Notice, RoleBadge } from "./ui.tsx";

const FIELDS: { key: keyof ControlInput; label: string; rows?: number; required?: boolean }[] = [
  { key: "name", label: "Control name", required: true },
  { key: "description", label: "Description", rows: 3, required: true },
  { key: "objective", label: "Objective", rows: 2 },
  { key: "activity", label: "Activity", rows: 2 },
  { key: "owner", label: "Owner" },
];

const time = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function ReviewPanel({
  record,
  aiBusy,
  aiError,
  blockers,
  onEditText,
  onRunAi,
  onPatch,
  onConfirm,
  onReopen,
  onRemove,
}: {
  record: ControlRecord;
  aiBusy: boolean;
  aiError: string | null;
  blockers: string[];
  onEditText: (field: keyof ControlInput, value: string) => void;
  onRunAi: () => void;
  onPatch: (f: FrameworkId, patch: FrameworkPatch) => void;
  onConfirm: () => void;
  onReopen: () => void;
  onRemove: () => void;
}) {
  const locked = record.confirmed !== null;
  const status = controlStatus(record);
  const ratings = confirmedRatings(record);
  const result = ratings ? scoreControl(ratings) : null;
  const ai = record.ai;

  return (
    <article className="space-y-4" aria-label={`Review ${record.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-slate-500">{record.id}{record.sampleId ? " · PUC sample (v1)" : " · entered by analyst"}</p>
          <h2 className="text-lg font-semibold text-slate-900">{record.current.name || "Untitled control"}</h2>
        </div>
        <div className="flex items-center gap-2">
          <ControlStatusBadge status={status} />
          {!locked && (
            <Button variant="danger" onClick={onRemove}>Remove</Button>
          )}
        </div>
      </header>

      {/* 1. Control text: the analyst's input */}
      <section className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 flex items-center gap-2">
          <RoleBadge role="Analyst" />
          <h3 className="text-sm font-semibold">Control</h3>
          {textEdited(record) && <span className="text-xs text-amber-800">edited since it was {record.sampleId ? "loaded" : "entered"}</span>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {FIELDS.map(({ key, label, rows, required }) => {
            const id = `${record.id}-${key}`;
            const common = {
              id,
              value: record.current[key] ?? "",
              disabled: locked,
              maxLength: INPUT_LIMITS[key],
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onEditText(key, e.target.value),
              className: "mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 disabled:bg-slate-50",
            };
            return (
              <label key={key} htmlFor={id} className={`text-xs font-medium text-slate-600 ${rows ? "sm:col-span-2" : ""}`}>
                {label}{required && " *"}
                {rows ? <textarea rows={rows} {...common} /> : <input {...common} />}
              </label>
            );
          })}
        </div>
      </section>

      {/* 2. AI suggestion */}
      <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RoleBadge role="AI" />
            <h3 className="text-sm font-semibold">AI-suggested mapping</h3>
            {ai && <ModeBadge mode={ai.mode} />}
          </div>
          {!locked && (
            <Button variant="ai" onClick={onRunAi} disabled={aiBusy || !record.current.name.trim() || !record.current.description.trim()}>
              {aiBusy ? "Asking AI…" : ai ? "Ask AI again" : "Suggest mapping with AI"}
            </Button>
          )}
        </div>
        {!ai && !aiError && (
          <p className="mt-2 text-sm text-slate-600">
            The AI proposes IDs from the reference catalogs, a rating and a one-line rationale per framework. Every item stays editable
            and nothing counts until you confirm. You can also map by hand below.
          </p>
        )}
        {aiError && <div className="mt-2"><Notice tone="error">{aiError}</Notice></div>}
        {ai && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-slate-600">
              {ai.model ? `${ai.model} · ` : ""}{time(ai.receivedAt)} · request {ai.requestId.slice(0, 8)} ·{" "}
              {locked ? "AI-generated, human-reviewed" : "AI-generated, awaiting your review"}
            </p>
            {aiIsStale(record) && (
              <Notice tone="warn">The control text changed after this suggestion was made. Ask the AI again, or check the mapping yourself.</Notice>
            )}
            {ai.notices.map((n) => (
              <Notice key={n} tone={n.startsWith("Demo mode") || n.startsWith("Mock") ? "warn" : n.includes("removed") || n.includes("shortened") ? "warn" : "info"}>
                {n}
              </Notice>
            ))}
            {ai.guardrails.warnings.map((w) => (
              <Notice key={w} tone="warn" title="Check this">{w}</Notice>
            ))}
            {(ai.proposal.uncertainties.length > 0 || ai.proposal.missingInformation.length > 0) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {ai.proposal.uncertainties.length > 0 && (
                  <div className="rounded-md bg-white p-2 text-sm ring-1 ring-violet-100">
                    <p className="text-xs font-semibold text-violet-900">Uncertainties and assumptions</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">{ai.proposal.uncertainties.map((u) => <li key={u}>{u}</li>)}</ul>
                  </div>
                )}
                {ai.proposal.missingInformation.length > 0 && (
                  <div className="rounded-md bg-white p-2 text-sm ring-1 ring-violet-100">
                    <p className="text-xs font-semibold text-violet-900">Missing information</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">{ai.proposal.missingInformation.map((u) => <li key={u}>{u}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. Analyst review, per framework */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <RoleBadge role="Analyst" />
          <h3 className="text-sm font-semibold">Review and edit the mapping</h3>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {FRAMEWORK_IDS.map((f) => (
            <FrameworkEditor key={f} record={record} framework={f} onPatch={(patch) => onPatch(f, patch)} />
          ))}
        </div>
      </section>

      {/* 4. Confirm, then code calculates */}
      <section className="rounded-lg border border-slate-200 p-3">
        {!locked ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RoleBadge role="Analyst" />
                <h3 className="text-sm font-semibold">Confirm</h3>
              </div>
              <Button variant="confirm" onClick={onConfirm}>Confirm mapping</Button>
            </div>
            <p className="text-sm text-slate-600">
              Only confirmed controls count in scores, the matrix and the report. Until then this control is shown as Awaiting review.
            </p>
            {blockers.length > 0 && (
              <Notice tone="error" title="Not ready to confirm">
                <ul className="list-disc pl-4">{blockers.map((b) => <li key={b}>{b.replace(/^[a-z0-9.-]+(?=:)/, (f) => FRAMEWORK_NAMES[f as FrameworkId] ?? f)}</li>)}</ul>
              </Notice>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RoleBadge role="Analyst" />
                <h3 className="text-sm font-semibold">Confirmed {time(record.confirmed!.at)}</h3>
              </div>
              <Button onClick={onReopen}>Reopen for edits</Button>
            </div>
            {result && (
              <div className="rounded-md bg-sky-50 p-2 text-sm text-sky-950">
                <div className="flex flex-wrap items-center gap-2">
                  <RoleBadge role="Code" />
                  <span>
                    Score <span className="font-semibold">{formatScore(result.score)}</span> over {result.inScope} framework
                    {result.inScope === 1 ? "" : "s"} · <span className="font-semibold">{result.status}</span>
                  </span>
                  {result.limitedCoverage && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">Limited framework coverage</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-sky-900">
                  {FRAMEWORK_IDS.map((f) => `${FRAMEWORK_NAMES[f]} ${RATING_LABELS[ratings![f].rating]}`).join(" · ")}. Calculated by code from
                  your confirmed ratings. This shows alignment to frameworks, not that the control is implemented or effective.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 5. Traceability */}
      <details className="rounded-lg border border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Traceability for this control (this tab only, not a durable audit trail)</summary>
        <div className="mt-2 space-y-2 text-slate-700">
          <div>
            <p className="text-xs font-semibold text-slate-500">Original control text</p>
            <p><span className="font-medium">{record.original.name}</span>: {record.original.description}</p>
          </div>
          {ai && (
            <div>
              <p className="text-xs font-semibold text-slate-500">AI request</p>
              <p>
                {ai.mode} · {ai.model ?? "no model"} · request {ai.requestId} · {time(ai.receivedAt)}
                {ai.guardrails.droppedIds.length > 0 && ` · ${ai.guardrails.droppedIds.length} ID(s) removed by validation`}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-500">History</p>
            <ol className="list-decimal pl-5">
              {record.history.map((h, i) => (
                <li key={i}>{time(h.at)}: {h.event}{h.detail ? ` (${h.detail})` : ""}</li>
              ))}
            </ol>
          </div>
        </div>
      </details>
    </article>
  );
}
