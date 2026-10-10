"use client";

import { getCatalog } from "@/lib/catalog/catalogs.ts";
import type { FrameworkId } from "@/lib/catalog/types.ts";
import { RATINGS, RATING_EFFECT, RATING_HELP, RATING_LABELS, type Rating } from "@/lib/scoring/config.ts";
import { differsFromAi, itemBadge, type ControlRecord, type FrameworkPatch } from "@/lib/workflow/workspace.ts";
import { CatalogPicker } from "./CatalogPicker.tsx";
import { FRAMEWORK_NAMES, ItemStatusBadge, RoleBadge } from "./ui.tsx";

const labelFor = (f: FrameworkId, id: string) => getCatalog(f).items.find((i) => i.id === id)?.label ?? "";

export function FrameworkEditor({
  record,
  framework,
  onPatch,
}: {
  record: ControlRecord;
  framework: FrameworkId;
  onPatch: (patch: FrameworkPatch) => void;
}) {
  const locked = record.confirmed !== null;
  const w = locked
    ? { ...record.confirmed!.mapping[framework], source: "analyst" as const, edited: true }
    : record.mapping[framework];
  const badge = itemBadge(record, framework);
  const aiProposal = record.ai?.proposal.frameworks[framework];
  const dropped = record.ai?.guardrails.droppedIds.filter((d) => d.framework === framework) ?? [];
  // Shown only where the analyst's values differ from the AI's suggestion; always starts collapsed.
  const showAiOriginal = Boolean(aiProposal) && differsFromAi(record, framework);
  const fieldId = `${record.id}-${framework}`;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3" aria-labelledby={`${fieldId}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={`${fieldId}-title`} className="text-sm font-semibold text-slate-900">{FRAMEWORK_NAMES[framework]}</h4>
        <div className="flex items-center gap-1.5">
          {badge === "AI-suggested" ? <RoleBadge role="AI" /> : badge !== "Not mapped" && <RoleBadge role="Analyst" />}
          <ItemStatusBadge badge={badge} />
        </div>
      </div>

      <div className="mt-2 space-y-2">
        <div>
          <p className="text-xs font-medium text-slate-600">Requirement IDs</p>
          {w.ids.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">{w.rating === "na" ? "None (rated N/A)." : "No IDs selected."}</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {w.ids.map((id) => (
                <li key={id} className="flex items-center gap-1 rounded bg-slate-100 py-0.5 pl-2 pr-1 text-xs" title={labelFor(framework, id)}>
                  <span className="font-mono font-semibold">{id}</span>
                  <span className="max-w-48 truncate text-slate-600">{labelFor(framework, id)}</span>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => onPatch({ ids: w.ids.filter((x) => x !== id) })}
                      className="rounded px-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                      aria-label={`Remove ${id}`}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!locked && (
            <div className="mt-1.5">
              <CatalogPicker framework={framework} selected={w.ids} onAdd={(id) => onPatch({ ids: [...w.ids, id] })} />
            </div>
          )}
        </div>

        <fieldset>
          <legend className="text-xs font-medium text-slate-600">Rating{!locked && w.rating === null && " (choose one)"}</legend>
          {locked ? (
            <p className="mt-1 text-sm text-slate-900">
              <span className="font-semibold">{w.rating ? RATING_LABELS[w.rating] : "Not rated"}</span>
              {w.rating && <span className="text-slate-600">: {RATING_HELP[w.rating]}</span>}
            </p>
          ) : (
            <div className="mt-1 space-y-1">
              {RATINGS.map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm ${
                    w.rating === r ? "bg-slate-100 ring-1 ring-slate-300" : "hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${fieldId}-rating`}
                    value={r}
                    checked={w.rating === r}
                    onChange={() => onPatch({ rating: r as Rating })}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>
                    <span className="font-semibold text-slate-900">{RATING_LABELS[r]}</span>
                    <span className="text-slate-600">: {RATING_HELP[r]}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {w.rating && <p className="mt-1 text-xs text-slate-500">{RATING_EFFECT[w.rating]}</p>}
        </fieldset>

        {w.rating === "na" && (
          <label className="block text-xs font-medium text-slate-600" htmlFor={`${fieldId}-na`}>
            Why there is no requirement here (required)
            <input
              id={`${fieldId}-na`}
              value={w.naReason}
              disabled={locked}
              maxLength={200}
              onChange={(e) => onPatch({ naReason: e.target.value })}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 disabled:bg-slate-50"
            />
          </label>
        )}

        <label className="block text-xs font-medium text-slate-600" htmlFor={`${fieldId}-rationale`}>
          {w.rating === "na" ? "Rationale (optional)" : "Rationale (required)"}
          <textarea
            id={`${fieldId}-rationale`}
            value={w.rationale}
            disabled={locked}
            rows={3}
            maxLength={600}
            onChange={(e) => onPatch({ rationale: e.target.value })}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 disabled:bg-slate-50"
          />
        </label>

        {dropped.length > 0 && (
          <p className="rounded bg-orange-50 px-2 py-1 text-xs text-orange-900">
            Guardrail: {dropped.length} suggested ID{dropped.length === 1 ? " was" : "s were"} not in the catalog and removed:{" "}
            <span className="font-mono">{dropped.map((d) => d.id).join(", ")}</span>
          </p>
        )}

        {showAiOriginal && aiProposal && (
          <details className="rounded bg-violet-50/60 px-2 py-1 text-xs text-violet-950">
            <summary className="cursor-pointer select-none">
              <RoleBadge role="AI" /> Original suggestion (you changed this)
            </summary>
            <p className="mt-1">
              <span className="font-semibold">{RATING_LABELS[aiProposal.rating]}</span>
              {aiProposal.ids.length > 0 && <span className="font-mono"> · {aiProposal.ids.join(", ")}</span>}
              {aiProposal.naReason && <span> · Reason: {aiProposal.naReason}</span>}
            </p>
            <p className="mt-0.5 text-violet-900">{aiProposal.rationale}</p>
          </details>
        )}
      </div>
    </section>
  );
}
