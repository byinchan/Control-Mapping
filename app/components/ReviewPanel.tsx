"use client";

import { useState } from "react";
import { FRAMEWORK_IDS, type FrameworkId } from "@/lib/catalog/types.ts";
import { INPUT_LIMITS } from "@/lib/mapping/config.ts";
import type { ControlInput } from "@/lib/mapping/types.ts";
import { RATING_LABELS } from "@/lib/scoring/config.ts";
import { formatScore, scoreControl } from "@/lib/scoring/score.ts";
import {
  aiIsStale,
  confirmedRatings,
  controlStatus,
  editedFrameworks,
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
const modeName = (m: string) => (m === "live" ? "Live AI" : m === "demo" ? "Demo mode (saved AI output)" : "Mock mapper (not AI)");
const frameworkList = (fs: FrameworkId[]) => fs.map((f) => FRAMEWORK_NAMES[f]).join(", ");

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
  onRunAi: (keepEdited: boolean) => void;
  onPatch: (f: FrameworkId, patch: FrameworkPatch) => void;
  onConfirm: () => void;
  onReopen: () => void;
  onRemove: () => void;
}) {
  const [editingText, setEditingText] = useState(false);
  const [askReplace, setAskReplace] = useState(false);
  const locked = record.confirmed !== null;
  const status = controlStatus(record);
  const ratings = confirmedRatings(record);
  const result = ratings ? scoreControl(ratings) : null;
  const ai = record.ai;
  const edited = editedFrameworks(record);
  const textReady = record.current.name.trim() && record.current.description.trim();

  const startAi = () => {
    if (ai && edited.length > 0) setAskReplace(true);
    else onRunAi(false);
  };

  return (
    <article className="space-y-4" aria-label={`Review ${record.id}`}>
      {/* Control: one-line summary, editable on request */}
      <section className="rounded-lg border border-slate-200 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <RoleBadge role="Analyst" />
              <span className="font-mono">{record.id}</span>
              <span>{record.sampleId ? "PUC sample (v1)" : "Entered by you"}</span>
              {textEdited(record) && <span className="text-amber-800">· text edited</span>}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{record.current.name || "Untitled control"}</h2>
            {!editingText && (
              <p className="text-sm text-slate-700">
                {record.current.description}
                {record.current.owner && <span className="text-slate-500"> · Owner: {record.current.owner}</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ControlStatusBadge status={status} />
            {!locked && (
              <Button onClick={() => setEditingText((v) => !v)}>{editingText ? "Done" : "Edit text"}</Button>
            )}
            {!locked && <Button variant="danger" onClick={onRemove}>Remove</Button>}
          </div>
        </div>
        {editingText && !locked && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {FIELDS.map(({ key, label, rows, required }) => {
              const id = `${record.id}-${key}`;
              const common = {
                id,
                value: record.current[key] ?? "",
                maxLength: INPUT_LIMITS[key],
                onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onEditText(key, e.target.value),
                className: "mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900",
              };
              return (
                <label key={key} htmlFor={id} className={`text-xs font-medium text-slate-600 ${rows ? "sm:col-span-2" : ""}`}>
                  {label}
                  {required && " *"}
                  {rows ? <textarea rows={rows} {...common} /> : <input {...common} />}
                </label>
              );
            })}
          </div>
        )}
      </section>

      {/* AI suggestion */}
      <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RoleBadge role="AI" />
            <h3 className="text-sm font-semibold">AI-suggested mapping</h3>
            {ai && <ModeBadge mode={ai.mode} />}
          </div>
          {!locked && !askReplace && (
            <Button variant="ai" onClick={startAi} disabled={aiBusy || !textReady}>
              {aiBusy ? "Asking AI…" : ai ? "Get a new AI suggestion" : "Suggest mapping with AI"}
            </Button>
          )}
        </div>

        {!locked && ai && !askReplace && (
          <p className="mt-1 text-xs text-slate-600">
            {ai.mode === "demo"
              ? "Demo mode returns the same saved suggestion for an unchanged sample control."
              : "AI choices and wording can vary between runs. A new suggestion replaces the current one."}
          </p>
        )}

        {askReplace && (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alertdialog" aria-label="Replace your edits?">
            <p className="font-semibold">You changed {frameworkList(edited)}.</p>
            <p className="mt-0.5">A new AI suggestion can replace everything, or only the frameworks you have not changed.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ai" onClick={() => { setAskReplace(false); onRunAi(true); }}>Keep my edited frameworks, replace the rest</Button>
              <Button onClick={() => { setAskReplace(false); onRunAi(false); }}>Replace everything</Button>
              <Button onClick={() => setAskReplace(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {!ai && !aiError && (
          <p className="mt-2 text-sm text-slate-600">
            The AI proposes IDs from the reference catalogs, a rating and a one-line rationale for each framework. Everything stays editable and
            nothing counts until you confirm. You can also map by hand below.
          </p>
        )}
        {aiError && <div className="mt-2"><Notice tone="error">{aiError}</Notice></div>}
        {ai && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-slate-600">
              {ai.model ? `${ai.model} · ` : ""}
              {time(ai.receivedAt)} · {locked ? "AI-generated, human-reviewed" : "AI-generated, awaiting your review"}
            </p>
            {aiIsStale(record) && !locked && (
              <Notice tone="warn">The control text changed after this suggestion was made. Get a new AI suggestion, or check the mapping yourself.</Notice>
            )}
            {ai.notices.map((n) => (
              <Notice key={n} tone={n.startsWith("Saved suggestion") ? "info" : "warn"}>{n}</Notice>
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

      {/* Analyst review per framework */}
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

      {/* Confirm, then code calculates */}
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
            <p className="text-sm text-slate-600">Only confirmed controls count in scores, the matrix and the report.</p>
            {blockers.length > 0 && (
              <Notice tone="error" title="Not ready to confirm">
                <ul className="list-disc pl-4">
                  {blockers.map((b) => (
                    <li key={b}>{b.replace(/^[a-z0-9.-]+(?=:)/, (f) => FRAMEWORK_NAMES[f as FrameworkId] ?? f)}</li>
                  ))}
                </ul>
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
                  {result.limitedCoverage && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">Limited framework coverage</span>}
                </div>
                <p className="mt-1 text-xs text-sky-900">
                  {FRAMEWORK_IDS.map((f) => `${FRAMEWORK_NAMES[f]} ${RATING_LABELS[ratings![f].rating]}`).join(" · ")}. Calculated by code from your
                  confirmed ratings. This shows alignment to frameworks, not that the control is implemented or effective.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* History */}
      <details className="rounded-lg border border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer">
          <span className="font-semibold">History for this control</span>
          <span className="ml-2 text-xs text-slate-500">Kept in this browser tab only.</span>
        </summary>
        <div className="mt-2 space-y-3 text-slate-700">
          <div>
            <p className="text-xs font-semibold text-slate-500">What was entered</p>
            <p><span className="font-medium">{record.original.name}</span>: {record.original.description}</p>
          </div>
          {ai && (
            <div>
              <p className="text-xs font-semibold text-slate-500">AI suggestion</p>
              <p>
                {modeName(ai.mode)}
                {ai.model ? `, ${ai.model}` : ""}, {time(ai.receivedAt)}, request {ai.requestId.slice(0, 8)}
                {ai.guardrails.droppedIds.length > 0 && `, ${ai.guardrails.droppedIds.length} ID(s) removed by validation`}
              </p>
            </div>
          )}
          {record.earlierAi.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500">Earlier AI suggestions (the last {record.earlierAi.length} kept)</p>
              <ul className="space-y-1">
                {record.earlierAi.map((e) => (
                  <li key={e.requestId}>
                    {modeName(e.mode)}, {time(e.receivedAt)}, replaced {time(e.replacedAt)}:{" "}
                    <span className="text-slate-600">
                      {FRAMEWORK_IDS.map((f) => `${FRAMEWORK_NAMES[f]} ${RATING_LABELS[e.frameworks[f].rating]}${e.frameworks[f].ids.length ? ` (${e.frameworks[f].ids.join(", ")})` : ""}`).join("; ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-500">Changes and decisions</p>
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
