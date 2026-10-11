"use client";

import { useEffect, useMemo, useState } from "react";
import { DISCLAIMER } from "@/lib/disclaimer.ts";
import { checkSection, type SectionCheck } from "@/lib/report/checks.ts";
import { STATUS_ORDER, buildFacts, type Facts } from "@/lib/report/facts.ts";
import {
  MAX_SECTION_LENGTH,
  SECTION_KEYS,
  SECTION_TITLES,
  approveReport,
  createReport,
  editSection,
  editedSections,
  estimatePrintedPages,
  isOutOfDate,
  markChecked,
  reconcile,
  redraft,
  reportBlockers,
  setPreparedBy,
  unapprove,
  type Report,
  type SectionKey,
} from "@/lib/report/report.ts";
import { templateSections } from "@/lib/report/template.ts";
import { RATING_LABELS } from "@/lib/scoring/config.ts";
import { StepIndicator } from "./StepIndicator.tsx";
import { Button, DisabledAction, Legend, Notice, RoleBadge, StepFooter, TextLink } from "./ui.tsx";
import { useWorkspace } from "./useWorkspace.ts";

const now = () => new Date().toISOString();
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
const MAX_GAP_ROWS = 5;

/** Plain text to paragraphs and bullet lists ("- " lines). */
function RenderedText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length) blocks.push(<ul key={`ul${blocks.length}`} className="list-disc space-y-0.5 pl-5">{items.map((i, n) => <li key={n}>{i}</li>)}</ul>);
    items = [];
  };
  for (const line of text.split("\n")) {
    if (/^\s*-\s+/.test(line)) items.push(line.replace(/^\s*-\s+/, ""));
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{line}</p>);
    }
  }
  flush();
  return <div className="space-y-1">{blocks}</div>;
}

function Flags({ check }: { check: SectionCheck }) {
  const blocking = [...check.numbers, ...check.references];
  if (blocking.length === 0 && check.claims.length === 0) return <p className="no-print mt-1 text-xs text-emerald-700">Figures match the code&apos;s results.</p>;
  return (
    <div className="no-print mt-1 space-y-1">
      {blocking.length > 0 && (
        <ul className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-900" aria-label="Figures to fix">
          {blocking.map((f, i) => (
            <li key={i}>
              <span aria-hidden>⚠ </span>&ldquo;{f.quote}&rdquo;: {f.message}
            </li>
          ))}
        </ul>
      )}
      {check.claims.length > 0 && (
        <ul className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-950" aria-label="Wording to check">
          {check.claims.map((f, i) => (
            <li key={i}>
              Check wording &ldquo;{f.quote}&rdquo;: {f.message} (warning only)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceBadge({ r, k }: { r: Report; k: SectionKey }) {
  const s = r.sections[k];
  if (s.edited) return <RoleBadge role="Analyst" />;
  if (s.source === "ai") return <RoleBadge role="AI" />;
  return <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[13px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-300">Template</span>;
}

function HeadlineTables({ f }: { f: Facts }) {
  return (
    <div className="space-y-2">
      <p>
        {STATUS_ORDER.map((s, i) => (
          <span key={s}>
            <span className="font-semibold">{f.statusCounts[s]}</span> {s} ({f.statusPercents[s]}){i < STATUS_ORDER.length - 1 ? " · " : ""}
          </span>
        ))}{" "}
        of {f.confirmed} confirmed control{f.confirmed === 1 ? "" : "s"}
        {f.notScorable > 0 && ` · ${f.notScorable} Not scorable`}
        {f.awaitingReview > 0 && ` · ${f.awaitingReview} awaiting review, not included`}.
      </p>
      <table className="report-table w-full text-left">
        <thead>
          <tr>
            <th>Framework</th>
            <th>Average rating</th>
            <th>Rated</th>
            <th>{RATING_LABELS.none}</th>
            <th>{RATING_LABELS.na}</th>
          </tr>
        </thead>
        <tbody>
          {f.coverage.map((c) => (
            <tr key={c.name}>
              <td>{c.name}</td>
              <td className="font-semibold">{c.average}</td>
              <td>{c.rated}</td>
              <td>{c.none}</td>
              <td>{c.na}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GapsTable({ f }: { f: Facts }) {
  // With no gaps there is no table; the narrative says so.
  if (f.gaps.length === 0) return null;
  const shown = f.gaps.slice(0, MAX_GAP_ROWS);
  return (
    <>
      <table className="report-table w-full text-left">
        <thead>
          <tr>
            <th>Control</th>
            <th>Owner</th>
            <th>Requirement not met in</th>
            <th>Score</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((g) => (
            <tr key={g.id}>
              <td>
                {g.id} {g.name}
              </td>
              <td>{g.owner ?? ""}</td>
              <td>{g.notMet.length ? g.notMet.join(", ") : "Low overall score"}</td>
              <td>{g.score}</td>
              <td>{g.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {f.gaps.length > MAX_GAP_ROWS && <p className="text-xs">+{f.gaps.length - MAX_GAP_ROWS} more in the matrix and CSV export.</p>}
    </>
  );
}

export function ReportScreen() {
  const { ws, change, discarded } = useWorkspace();
  const facts = useMemo(() => (ws ? buildFacts(ws) : null), [ws]);
  const [askRedraft, setAskRedraft] = useState(false);
  const [triedApprove, setTriedApprove] = useState(false);
  const report = ws?.report ?? null;

  // Approval only stands for the results it was given for.
  useEffect(() => {
    if (report && facts && report.approved && isOutOfDate(report, facts)) change((w) => ({ ...w, report: reconcile(report, facts) }));
  }, [report, facts, change]);

  if (!ws || !facts) return <p className="text-sm text-slate-500">Loading…</p>;

  if (facts.confirmed === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <StepIndicator current={4} confirmedCount={0} />
        {discarded && <Notice tone="warn">Saved data in this tab failed validation and was discarded.</Notice>}
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <p className="text-slate-700">Confirm at least one control to start the report.</p>
          <p className="mt-3 text-sm">
            <TextLink href={ws.controls.length ? "/review" : "/"}>{ws.controls.length ? "Go to review" : "Choose controls"}</TextLink>
          </p>
        </div>
      </div>
    );
  }

  const setReport = (fn: (r: Report) => Report) => change((w) => (w.report ? { ...w, report: fn(w.report) } : w));
  const startTemplate = () => change((w) => ({ ...w, report: createReport(facts, templateSections(facts), "template", null, now()) }));
  const redraftTemplate = (keepEdited: boolean) => {
    setReport((r) => redraft(r, facts, templateSections(facts), "template", null, now(), keepEdited));
    setAskRedraft(false);
  };

  if (!report) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <StepIndicator current={4} confirmedCount={facts.confirmed} />
        <h1 className="text-xl font-semibold text-slate-900">Executive report</h1>
        <p className="text-sm text-slate-700">
          A 1 to 2 page summary of the {facts.confirmed} confirmed control{facts.confirmed === 1 ? "" : "s"} for a board-level reader. Every
          figure comes from code; the narrative is a draft you edit and approve.
        </p>
        <div className="rounded-lg border border-slate-200 p-4">
          <Button variant="primary" size="lg" onClick={startTemplate}>
            Start with a template draft <span aria-hidden>→</span>
          </Button>
          <p className="mt-2 text-xs text-slate-600">Template draft, not AI: plain text built by code from your confirmed results.</p>
        </div>
      </div>
    );
  }

  const outOfDate = isOutOfDate(report, facts);
  const approve = () => {
    setTriedApprove(true);
    const res = approveReport(report, facts, now());
    if (res.blockers.length === 0) setReport(() => res.report);
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const approved = report.approved !== null && !outOfDate;
  const checks = Object.fromEntries(SECTION_KEYS.map((k) => [k, checkSection(report.sections[k].text, facts)])) as Record<SectionKey, SectionCheck>;
  const blockers = reportBlockers(report, facts);
  const pages = estimatePrintedPages(report, facts);
  const edited = editedSections(report);
  const narrativeLabel = report.draftSource === "ai" ? `AI-generated, human-reviewed${report.model ? ` (${report.model})` : ""}` : "Template draft, not AI";

  const section = (k: SectionKey, extra?: React.ReactNode) => (
    <section key={k} className="report-section" aria-labelledby={`report-${k}`}>
      <div className="flex items-center gap-2">
        <h2 id={`report-${k}`} className="report-h2">{SECTION_TITLES[k]}</h2>
        <span className="no-print">
          <SourceBadge r={report} k={k} />
        </span>
      </div>
      {extra}
      {approved ? (
        <RenderedText text={report.sections[k].text} />
      ) : (
        <>
          <textarea
            aria-label={SECTION_TITLES[k]}
            value={report.sections[k].text}
            maxLength={MAX_SECTION_LENGTH}
            rows={Math.min(10, Math.max(3, report.sections[k].text.split("\n").length + 1))}
            onChange={(e) => setReport((r) => editSection(r, k, e.target.value))}
            className="no-print block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
          <Flags check={checks[k]} />
        </>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="no-print space-y-3">
        <StepIndicator current={4} confirmedCount={facts.confirmed} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-slate-900">Executive report</h1>
          <Legend />
        </div>

        {outOfDate && (
          <Notice tone="warn" title="Out of date: confirmations changed after this draft">
            <p>The figures and tables show the current results. Check the narrative against them; any figure that no longer matches is listed under its section.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button onClick={() => setReport((r) => markChecked(r, facts))}>I&apos;ve checked the narrative against the current results</Button>
              <Button onClick={() => setAskRedraft(true)}>Redraft from template</Button>
            </div>
          </Notice>
        )}

        {/* Toolbar: approve, edit, redraft, PDF */}
        <div className="sticky top-0 z-20 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm">
              <RoleBadge role="Analyst" />
              {approved ? (
                <span className="font-medium text-emerald-800">Approved {day(report.approved!.at)}</span>
              ) : (
                <span className="text-slate-700">Draft: edit the narrative, then approve.</span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {!approved && <Button onClick={() => setAskRedraft(true)}>Redraft from template</Button>}
              {approved ? (
                <Button onClick={() => setReport(unapprove)}>Edit report (removes approval)</Button>
              ) : (
                <Button variant="confirm" onClick={approve}>
                  Approve report
                </Button>
              )}
              {approved ? (
                <Button variant="primary" onClick={() => window.print()}>
                  Download PDF
                </Button>
              ) : (
                <DisabledAction reason="Approve the report first">Download PDF</DisabledAction>
              )}
            </div>
          </div>
          {!approved && triedApprove && blockers.length > 0 && (
            <div className="mt-2">
              <Notice tone="error" title="Not ready to approve">
                <ul className="list-disc pl-4">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
              </Notice>
            </div>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Download PDF opens your browser&apos;s print dialog; choose &ldquo;Save as PDF&rdquo;.
            {pages > 2 && <span className="font-medium text-amber-800"> This may run over 2 pages: shorten the longest sections.</span>}
          </p>
        </div>

        {askRedraft && (
          <Notice tone="warn" title="Redraft the narrative from the template?">
            <p>
              {edited.length > 0
                ? `You edited: ${edited.map((k) => SECTION_TITLES[k]).join(", ")}.`
                : "You have not edited any section."}{" "}
              A new template draft replaces the section text and removes approval. Figures and tables are not affected.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {edited.length > 0 && <Button onClick={() => redraftTemplate(true)}>Keep my edited sections, replace the rest</Button>}
              <Button onClick={() => redraftTemplate(false)}>Replace everything</Button>
              <Button onClick={() => setAskRedraft(false)}>Cancel</Button>
            </div>
          </Notice>
        )}
      </div>

      {/* The report document: this is what prints */}
      <article className="report-doc rounded-lg border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-900">
        <header className="report-section border-b border-slate-200 pb-2">
          <h1 className="text-lg font-semibold">Control Mapping and Framework Alignment: Executive Summary</h1>
          <p>Pacific Utilities Corporation (PUC), a fictional organization</p>
          <p className="text-xs text-slate-600">
            {day(report.approved?.at ?? report.draftedAt)} · Based on {facts.confirmed} confirmed control{facts.confirmed === 1 ? "" : "s"} · Narrative:{" "}
            {narrativeLabel} · {approved ? "Approved by the analyst" : "Draft, not approved"}
          </p>
          <p className="text-xs text-slate-600">
            Prepared by:{" "}
            <input
              aria-label="Prepared by"
              value={report.preparedBy}
              placeholder="Your name and role"
              maxLength={120}
              disabled={approved}
              onChange={(e) => setReport((r) => setPreparedBy(r, e.target.value))}
              className="no-print rounded border border-slate-300 px-1.5 py-0.5 text-xs disabled:border-transparent disabled:bg-transparent"
            />
            <span className="print-only">{report.preparedBy || "Not given"}</span>
          </p>
        </header>

        {section("purpose")}

        <section className="report-section" aria-labelledby="report-headline">
          <div className="flex items-center gap-2">
            <h2 id="report-headline" className="report-h2">Headline results</h2>
            <span className="no-print"><RoleBadge role="Code" /></span>
          </div>
          <HeadlineTables f={facts} />
        </section>

        {section("keyMessages")}
        {section("strengths")}
        {section(
          "gapsAndRisks",
          <div className="mb-1">
            <GapsTable f={facts} />
          </div>,
        )}
        {section("recommendations")}
        {section("method")}

        <footer className="report-section mt-3 border-t border-slate-200 pt-2 text-xs text-slate-700">
          <p className="font-medium">Fictional organization. AI-assisted, human-reviewed.</p>
          <p>
            Governance note: every count, score, status and table in this report was calculated by code from the analyst&apos;s confirmed
            mappings. The narrative was drafted by {report.draftSource === "ai" ? "an AI model" : "a code template"}, then edited and approved by
            the analyst; a check confirms that each figure in the narrative matches the code&apos;s results. This report shows alignment of control
            descriptions to frameworks, not that controls are implemented or effective.
          </p>
          <p>{DISCLAIMER}</p>
        </footer>
      </article>

      {/* Next step: approve, then download */}
      <StepFooter back={{ href: "/matrix", label: "Back to matrix & gaps" }}>
        {approved ? (
          <Button variant="primary" size="lg" onClick={() => window.print()}>
            Download PDF <span aria-hidden>→</span>
          </Button>
        ) : (
          <Button variant="primary" size="lg" onClick={approve}>
            Approve report <span aria-hidden>→</span>
          </Button>
        )}
      </StepFooter>
      {!approved && triedApprove && blockers.length > 0 && (
        <p className="no-print text-right text-xs text-red-700">Not ready to approve: see the list at the top of the page.</p>
      )}
      <p className="no-print text-xs text-slate-500">The report is kept only in this browser tab, like the rest of your work.</p>
    </div>
  );
}
