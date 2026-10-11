// The executive report's state: narrative sections, recommendations, approval and staleness. Pure functions.
import { OWNER_TO_ASSIGN, checkRecommendations, checkSection, matchOwner, sectionBlocks } from "./checks.ts";
import { factsFingerprint, type Facts } from "./facts.ts";

/** Text sections, in report order. Recommendations are structured and kept separately. */
export const SECTION_KEYS = ["keyMessages", "decisionRequested", "purpose", "strengths", "gapsAndRisks", "method"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
/** Everything the narrative author drafts or the analyst edits: the text sections plus the recommendations. */
export type PartKey = SectionKey | "recommendations";

export const PART_TITLES: Record<PartKey, string> = {
  keyMessages: "Key messages",
  decisionRequested: "Decision requested",
  purpose: "Purpose and scope",
  strengths: "Strengths",
  gapsAndRisks: "Gaps and risks",
  recommendations: "Recommendations",
  method: "Method and limitations",
};
export const SECTION_TITLES: Record<SectionKey, string> = PART_TITLES;

/** Parts written by the narrative author (AI or template); the others are code templates the analyst may edit. */
export const NARRATIVE_KEYS: readonly PartKey[] = ["keyMessages", "decisionRequested", "strengths", "gapsAndRisks", "recommendations"];

export const MAX_SECTION_LENGTH = 2000;
export const MAX_RECOMMENDATIONS = 6;
export const RECOMMENDATION_LIMITS = { text: 400, owner: 120, effort: 20, rationale: 300 } as const;
export type RecommendationField = keyof typeof RECOMMENDATION_LIMITS;

export type ReportSection = { text: string; source: "template" | "ai"; edited: boolean };
export type Recommendation = { text: string; owner: string; effort: string; rationale: string };
export type RecommendationsPart = { items: Recommendation[]; source: "template" | "ai"; edited: boolean };

/** A narrative draft from the template or the AI, before it becomes a report. */
export type Draft = { sections: Record<SectionKey, string>; recommendations: Recommendation[] };

export type Report = {
  /** Fingerprint of the confirmed results the narrative was last checked against. */
  fingerprint: string;
  draftedAt: string;
  draftSource: "template" | "ai";
  model: string | null;
  sections: Record<SectionKey, ReportSection>;
  recommendations: RecommendationsPart;
  preparedBy: string;
  approved: { at: string; fingerprint: string } | null;
};

/**
 * The owner rule, applied whenever a draft is made: an owner that is not in the confirmed results becomes
 * "Control owner (to assign)". Returns how many were replaced, so the analyst can be told.
 */
export function applyOwnerRule(items: readonly Recommendation[], facts: Facts): { items: Recommendation[]; replaced: number } {
  let replaced = 0;
  const out = items.map((r) => {
    const owner = matchOwner(r.owner, facts);
    if (!owner) replaced += 1;
    return { ...r, owner: owner ?? OWNER_TO_ASSIGN };
  });
  return { items: out, replaced };
}

const capRecommendation = (r: Recommendation): Recommendation => ({
  text: r.text.slice(0, RECOMMENDATION_LIMITS.text),
  owner: r.owner.slice(0, RECOMMENDATION_LIMITS.owner),
  effort: r.effort.slice(0, RECOMMENDATION_LIMITS.effort),
  rationale: r.rationale.slice(0, RECOMMENDATION_LIMITS.rationale),
});

export function createReport(facts: Facts, draft: Draft, source: "template" | "ai", model: string | null, now: string): Report {
  return {
    fingerprint: factsFingerprint(facts),
    draftedAt: now,
    draftSource: source,
    model,
    sections: Object.fromEntries(
      SECTION_KEYS.map((k) => [k, { text: draft.sections[k].slice(0, MAX_SECTION_LENGTH), source, edited: false }]),
    ) as Report["sections"],
    recommendations: {
      items: applyOwnerRule(draft.recommendations.slice(0, MAX_RECOMMENDATIONS), facts).items.map(capRecommendation),
      source,
      edited: false,
    },
    preparedBy: "",
    approved: null,
  };
}

/** Puts a new draft in. With keepEdited, parts the analyst changed keep the analyst's text. Clears approval. */
export function redraft(
  r: Report,
  facts: Facts,
  draft: Draft,
  source: "template" | "ai",
  model: string | null,
  now: string,
  keepEdited: boolean,
): Report {
  const next = createReport(facts, draft, source, model, now);
  for (const k of SECTION_KEYS) if (keepEdited && r.sections[k].edited) next.sections[k] = r.sections[k];
  if (keepEdited && r.recommendations.edited) next.recommendations = r.recommendations;
  return { ...next, preparedBy: r.preparedBy };
}

export const editedParts = (r: Report): PartKey[] => [
  ...SECTION_KEYS.filter((k) => r.sections[k].edited),
  ...(r.recommendations.edited ? (["recommendations"] as const) : []),
];

/** Any edit clears approval. */
export function editSection(r: Report, key: SectionKey, text: string): Report {
  return { ...r, approved: null, sections: { ...r.sections, [key]: { ...r.sections[key], text: text.slice(0, MAX_SECTION_LENGTH), edited: true } } };
}

/** Any edit clears approval. Values are capped; the owner and effort rules are checked, not silently changed. */
export function editRecommendation(r: Report, index: number, field: RecommendationField, value: string): Report {
  if (index < 0 || index >= r.recommendations.items.length) return r;
  const items = r.recommendations.items.map((item, i) => (i === index ? { ...item, [field]: value.slice(0, RECOMMENDATION_LIMITS[field]) } : item));
  return { ...r, approved: null, recommendations: { ...r.recommendations, items, edited: true } };
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
  const rc = checkRecommendations(r.recommendations.items, facts);
  if (sectionBlocks(rc)) blockers.push(`Recommendations: ${rc.numbers.length + rc.references.length + rc.fields.length} figure, reference, owner or effort to fix.`);
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
 * the fixed blocks (title, code lines, tables, footer).
 */
export function estimatePrintedPages(r: Report, facts: Facts): number {
  // Calibrated for the 11 pt print text (about 86 characters per line, 50 lines per page).
  const CHARS_PER_LINE = 86;
  const LINES_PER_PAGE = 50;
  const wrap = (text: string, width = CHARS_PER_LINE) => Math.max(1, Math.ceil(text.length / width));
  let lines = 12; // title block, headline figures, footer and governance note
  lines += 4; // posture line and "what this report does not show"
  lines += 2 + facts.coverage.length; // coverage table
  lines += 2 + Math.min(facts.gaps.length, 5) + (facts.gaps.length > 5 ? 1 : 0); // gaps table
  for (const k of SECTION_KEYS) {
    lines += 2; // heading and spacing
    for (const para of r.sections[k].text.split("\n")) lines += wrap(para);
  }
  // Recommendations table: the text and "why" columns are each a little under half the page width.
  lines += 3;
  for (const item of r.recommendations.items) lines += Math.max(wrap(item.text, 38), wrap(item.rationale, 30));
  return lines / LINES_PER_PAGE;
}
