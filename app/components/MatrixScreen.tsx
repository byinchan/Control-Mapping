"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getCatalog } from "@/lib/catalog/catalogs.ts";
import { FRAMEWORK_IDS, type FrameworkId } from "@/lib/catalog/types.ts";
import { csvFileName, matrixCsv } from "@/lib/results/csv.ts";
import { buildResults } from "@/lib/results/matrix.ts";
import { RATING_LABELS, SCORING_RULE_TEXT, type Rating, type Status } from "@/lib/scoring/config.ts";
import { formatScore } from "@/lib/scoring/score.ts";
import { StepIndicator } from "./StepIndicator.tsx";
import { Button, DisabledAction, FRAMEWORK_NAMES, Legend, LinkButton, Notice, RatingKey, RoleBadge, TextLink, cx } from "./ui.tsx";
import { useWorkspace } from "./useWorkspace.ts";

const STATUS_STYLE: Record<Status, string> = {
  "Fully Aligned": "bg-emerald-100 text-emerald-900",
  "Partially Aligned": "bg-amber-100 text-amber-900",
  "Gap Identified": "bg-red-100 text-red-900",
  "Not scorable": "bg-slate-100 text-slate-700",
};

const RATING_STYLE: Record<Rating, string> = {
  full: "text-emerald-800",
  partial: "text-amber-800",
  none: "text-red-800",
  na: "text-slate-500",
};

function StatusBadge({ status }: { status: Status }) {
  return <span className={cx("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[status])}>{status}</span>;
}

const label = (f: FrameworkId, id: string) => getCatalog(f).items.find((i) => i.id === id)?.label ?? "";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function downloadCsv(text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = csvFileName(new Date());
  a.click();
  URL.revokeObjectURL(url);
}

export function MatrixScreen() {
  const { ws, discarded } = useWorkspace();
  const results = useMemo(() => (ws ? buildResults(ws) : null), [ws]);
  if (!ws || !results) return <p className="text-sm text-slate-500">Loading…</p>;

  const { rows, summary, gaps, checks, awaitingReview } = results;
  const n = rows.length;

  if (n === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <StepIndicator current={3} confirmedCount={0} />
        {discarded && <Notice tone="warn">Saved data in this tab failed validation and was discarded.</Notice>}
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <p className="text-slate-700">Confirm at least one control to see the matrix and gaps.</p>
          <p className="mt-1 text-sm text-slate-500">Only confirmed controls count in results.</p>
          <p className="mt-3 text-sm">
            <TextLink href={ws.controls.length > 0 ? "/review" : "/"}>
              {ws.controls.length > 0 ? `Go to review (${plural(ws.controls.length, "control")} in this tab)` : "Choose controls"}
            </TextLink>
          </p>
          <div className="mt-4 flex justify-center">
            <DisabledAction size="lg" reason="Confirm at least 1 control first">
              Continue to the executive report <span aria-hidden>→</span>
            </DisabledAction>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <StepIndicator current={3} confirmedCount={n} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Matrix and gaps</h1>
        <Legend />
      </div>
      <RatingKey />

      {/* Summary: all figures are calculated by code from confirmed controls */}
      <section className="rounded-lg border border-sky-200 bg-sky-50/50 p-4" aria-labelledby="summary-title">
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge role="Code" />
          <h2 id="summary-title" className="text-sm font-semibold">
            Results for {plural(n, "confirmed control")}
          </h2>
        </div>
        <p className="mt-1 text-sm text-slate-700">
          {n === 1 ? "These results describe this one control only." : "Calculated from your confirmed ratings."}
          {awaitingReview > 0 && ` ${plural(awaitingReview, "control")} awaiting review ${awaitingReview === 1 ? "is" : "are"} not included.`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {(["Fully Aligned", "Partially Aligned", "Gap Identified"] as const).map((s) => (
            <span key={s} className={cx("rounded-md px-2.5 py-1", STATUS_STYLE[s])}>
              <span className="font-semibold">{summary.statusCounts[s]}</span> {s}
            </span>
          ))}
          {summary.notScorable.length > 0 && (
            <span className={cx("rounded-md px-2.5 py-1", STATUS_STYLE["Not scorable"])}>
              <span className="font-semibold">{summary.notScorable.length}</span> Not scorable
            </span>
          )}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Coverage by framework</caption>
            <thead className="text-xs text-slate-600">
              <tr>
                <th className="py-1 pr-4 font-medium">Framework</th>
                <th className="py-1 pr-4 font-medium">Average rating</th>
                <th className="py-1 pr-4 font-medium">Rated</th>
                <th className="py-1 pr-4 font-medium">{RATING_LABELS.na}</th>
                <th className="py-1 font-medium">{RATING_LABELS.none}</th>
              </tr>
            </thead>
            <tbody>
              {FRAMEWORK_IDS.map((f) => {
                const fw = summary.frameworks[f];
                return (
                  <tr key={f} className="border-t border-sky-100">
                    <td className="py-1 pr-4">{FRAMEWORK_NAMES[f]}</td>
                    <td className="py-1 pr-4 font-semibold">{fw.coverage === null ? "n/a" : formatScore(fw.coverage)}</td>
                    <td className="py-1 pr-4">{fw.inScope}</td>
                    <td className="py-1 pr-4">{fw.counts.na}</td>
                    <td className="py-1">{fw.counts.none}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-slate-700">How the score and status are calculated</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700">
            {SCORING_RULE_TEXT.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
        <p className="mt-2 text-xs text-slate-600">
          This shows how well each control, as described, aligns to the frameworks. It does not show that controls are implemented or effective.
        </p>
      </section>

      {/* Matrix */}
      <section aria-labelledby="matrix-title" className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="matrix-title" className="text-base font-semibold">Control matrix</h2>
          <div className="text-right">
            <Button onClick={() => downloadCsv(matrixCsv(rows))}>Download CSV</Button>
            <p className="mt-1 text-xs text-slate-500">Confirmed controls only. Built in your browser; nothing is uploaded.</p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[56rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Control</th>
                {FRAMEWORK_IDS.map((f) => (
                  <th key={f} className="px-3 py-2 font-medium">{FRAMEWORK_NAMES[f]}</th>
                ))}
                <th className="px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1">Score <RoleBadge role="Code" /></span>
                </th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">
                    <TextLink href={`/review?focus=${row.id}`}>
                      <span className="font-mono text-xs">{row.id}</span> <span className="font-medium">{row.control.name}</span>
                    </TextLink>
                    {row.control.owner && <p className="text-xs text-slate-500">{row.control.owner}</p>}
                  </td>
                  {FRAMEWORK_IDS.map((f) => {
                    const cell = row.cells[f];
                    return (
                      <td key={f} className="px-3 py-2">
                        <p className={cx("font-semibold", RATING_STYLE[cell.rating])}>{RATING_LABELS[cell.rating]}</p>
                        {cell.rating === "na" ? (
                          <p className="line-clamp-3 max-w-56 text-xs text-slate-500" title={cell.naReason}>
                            {cell.naReason}
                          </p>
                        ) : (
                          <p className="font-mono text-xs text-slate-700">
                            {cell.ids.map((id, i) => (
                              <span key={id} title={label(f, id)} className="whitespace-nowrap">
                                {id}
                                {i < cell.ids.length - 1 ? ", " : ""}
                              </span>
                            ))}
                          </p>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 font-semibold">{formatScore(row.score)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={row.status} />
                    {row.limitedCoverage && <p className="mt-1 text-xs text-amber-800">Limited framework coverage</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">Select a control name to open it in review.</p>
      </section>

      {/* Gaps and checks */}
      <section aria-labelledby="gaps-title" className="space-y-2">
        <h2 id="gaps-title" className="text-base font-semibold">Gaps and requirements not met</h2>
        <p className="text-sm text-slate-600">
          Controls with status Gap Identified, and controls rated {RATING_LABELS.none} on any framework (the framework has a requirement the control,
          as described, doesn&apos;t meet).
        </p>
        <p className="text-sm text-slate-600">
          Overall status can still be Partially Aligned when one framework has a requirement this control doesn&apos;t meet.
        </p>
        {gaps.length === 0 ? (
          <Notice tone="ok">No gaps among the confirmed controls.</Notice>
        ) : (
          <ul className="space-y-2">
            {gaps.map((g) => (
              <li key={g.id} className="rounded-lg border border-red-200 bg-red-50/40 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <TextLink href={`/review?focus=${g.id}`} className="font-medium">
                    <span className="font-mono text-xs">{g.id}</span> {g.name}
                  </TextLink>
                  <StatusBadge status={g.status} />
                  <span className="text-xs text-slate-600">score {formatScore(g.score)}</span>
                </div>
                {g.noneFrameworks.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700">
                    {g.noneFrameworks.map((nf) => (
                      <li key={nf.framework}>
                        <span className="font-medium">{FRAMEWORK_NAMES[nf.framework]}</span>: {RATING_LABELS.none}
                        {nf.ids.length > 0 && <span className="font-mono text-xs"> ({nf.ids.join(", ")})</span>}. {nf.rationale}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-slate-700">Low overall score with no framework rated {RATING_LABELS.none}.</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {checks.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-semibold">To check (not gaps)</h3>
            <ul className="space-y-2">
              {checks.map((c) => (
                <li key={c.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm">
                  <TextLink href={`/review?focus=${c.id}`} className="font-medium">
                    <span className="font-mono text-xs">{c.id}</span> {c.name}
                  </TextLink>
                  <p className="mt-0.5 text-slate-700">
                    {c.kind === "not-scorable"
                      ? `Not scorable: every framework is ${RATING_LABELS.na}.`
                      : "Limited framework coverage: only one framework is rated, so the result rests on that framework alone."}
                  </p>
                  {c.naFrameworks.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
                      {c.naFrameworks.map((nf) => (
                        <li key={nf.framework}>
                          {FRAMEWORK_NAMES[nf.framework]}: {RATING_LABELS.na} ({nf.reason})
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Next step */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <TextLink href="/review" className="text-sm">
          ← Back to review
        </TextLink>
        <LinkButton href="/report" variant="primary" size="lg">
          Continue to the executive report <span aria-hidden>→</span>
        </LinkButton>
      </div>
    </div>
  );
}
