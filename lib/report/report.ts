// The executive report's state: narrative sections, approval and staleness. Pure functions.
import { checkSection, sectionBlocks } from "./checks.ts";
import { factsFingerprint, type Facts } from "./facts.ts";

export const SECTION_KEYS = ["purpose", "keyMessages", "strengths", "gapsAndRisks", "recommendations", "method"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_TITLES: Record<SectionKey, string> = {
  purpose: "Purpose and scope",
  keyMessages: "Key messages",
  strengths: "Strengths",
  gapsAndRisks: "Gaps and risks",
  recommendations: "Recommendations",
  method: "Method and limitations",
};

/** Sections written by the narrative author (AI or template); the others are code templates the analyst may edit. */
export const NARRATIVE_KEYS: readonly SectionKey[] = ["keyMessages", "strengths", "gapsAndRisks", "recommendations"];

export const MAX_SECTION_LENGTH = 2000;

export type ReportSection = { text: string; source: "template" | "ai"; edited: boolean };

export type Report = {
  /** Fingerprint of the confirmed results the narrative was last checked against. */
  fingerprint: string;
  draftedAt: string;
  draftSource: "template" | "ai";
  model: string | null;
  sections: Record<SectionKey, ReportSection>;
  preparedBy: string;
  approved: { at: string; fingerprint: string } | null;
};

export function createReport(
  facts: Facts,
  texts: Record<SectionKey, string>,
  source: "template" | "ai",
  model: string | null,
  now: string,
): Report {
  return {
    fingerprint: factsFingerprint(facts),
    draftedAt: now,
    draftSource: source,
    model,
    sections: Object.fromEntries(SECTION_KEYS.map((k) => [k, { text: texts[k], source, edited: false }])) as Report["sections"],
    preparedBy: "",
    approved: null,
  };
}

/** Puts a new draft in. With keepEdited, sections the analyst changed keep the analyst's text. Clears approval. */
export function redraft(
  r: Report,
  facts: Facts,
  texts: Record<SectionKey, string>,
  source: "template" | "ai",
  model: string | null,
  now: string,
  keepEdited: boolean,
): Report {
  const next = createReport(facts, texts, source, model, now);
  for (const k of SECTION_KEYS) if (keepEdited && r.sections[k].edited) next.sections[k] = r.sections[k];
  return { ...next, preparedBy: r.preparedBy };
}

export const editedSections = (r: Report) => SECTION_KEYS.filter((k) => r.sections[k].edited);

/** Any edit clears approval. */
export function editSection(r: Report, key: SectionKey, text: string): Report {
  return { ...r, approved: null, sections: { ...r.sections, [key]: { ...r.sections[key], text: text.slice(0, MAX_SECTION_LENGTH), edited: true } } };
}

export const setPreparedBy = (r: Report, name: string): Report => ({ ...r, approved: null, preparedBy: name.slice(0, 120) });

/** True when confirmations changed after the narrative was last checked. */
export const isOutOfDate = (r: Report, facts: Facts) => r.fingerprint !== factsFingerprint(facts);

/** Approval only stands for the results it was given for; when they change, it is cleared. */
export const reconcile = (r: Report, facts: Facts): Report =>
  r.approved && r.approved.fingerprint !== factsFingerprint(facts) ? { ...r, approved: null } : r;

/** The analyst has checked the narrative against the current results. */
export const markChecked = (r: Report, facts: Facts): Report => ({ ...r, approved: null, fingerprint: factsFingerprint(facts) });

export function reportBlockers(r: Report, facts: Facts): string[] {
  const blockers: string[] = [];
  if (facts.confirmed === 0) blockers.push("Confirm at least one control.");
  if (isOutOfDate(r, facts)) blockers.push("Confirmations changed after this draft. Check the narrative, then mark it as checked.");
  // Whitespace-only does not count.
  if (!r.preparedBy.trim()) blockers.push("Prepared by: add your name or initials and role.");
  for (const k of SECTION_KEYS) {
    const c = checkSection(r.sections[k].text, facts);
    if (sectionBlocks(c)) blockers.push(`${SECTION_TITLES[k]}: ${c.numbers.length + c.references.length} figure or reference to fix.`);
  }
  return blockers;
}

export function approveReport(r: Report, facts: Facts, now: string): { report: Report; blockers: string[] } {
  const blockers = reportBlockers(r, facts);
  if (blockers.length) return { report: r, blockers };
  return { report: { ...r, approved: { at: now, fingerprint: factsFingerprint(facts) } }, blockers: [] };
}

export const unapprove = (r: Report): Report => ({ ...r, approved: null });

/**
 * Rough printed length of the report, for the "may run over 2 pages" note. Counts wrapped text lines plus
 * the fixed blocks (title, tables, footer).
 */
export function estimatePrintedPages(r: Report, facts: Facts): number {
  // Calibrated for the 11 pt print text (about 86 characters per line, 50 lines per page).
  const CHARS_PER_LINE = 86;
  const LINES_PER_PAGE = 50;
  let lines = 12; // title block, headline figures, footer and governance note
  lines += 2 + facts.coverage.length; // coverage table
  lines += 2 + Math.min(facts.gaps.length, 5) + (facts.gaps.length > 5 ? 1 : 0); // gaps table
  for (const k of SECTION_KEYS) {
    lines += 2; // heading and spacing
    for (const para of r.sections[k].text.split("\n")) lines += Math.max(1, Math.ceil(para.length / CHARS_PER_LINE));
  }
  return lines / LINES_PER_PAGE;
}
