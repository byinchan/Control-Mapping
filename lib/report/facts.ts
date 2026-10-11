// The report's facts pack: every figure and name the report may state, computed by code from
// CONFIRMED controls only. The narrative (template or AI) may quote these figures, never compute new ones.
import { FRAMEWORK_NAMES } from "../catalog/names.ts";
import { FRAMEWORK_IDS, type FrameworkId } from "../catalog/types.ts";
import { RATING_HALF_POINTS, RATING_LABELS, THRESHOLDS, type Rating, type Status } from "../scoring/config.ts";
import { formatScore, scoreControl, summarize, type ControlRatings } from "../scoring/score.ts";
import { confirmedRatings, type Workspace } from "../workflow/workspace.ts";

export const ORGANISATION = "Pacific Utilities Corporation (PUC)";
export const STATUS_ORDER = ["Fully Aligned", "Partially Aligned", "Gap Identified"] as const;

export type FactsControl = {
  id: string;
  name: string;
  owner: string | null;
  score: string;
  status: Status;
  limitedCoverage: boolean;
  ratings: Record<string, string>;
  /** Frameworks rated None (a requirement the control, as described, doesn't meet). */
  notMet: string[];
};

export type FactsFramework = { name: string; rated: number; na: number; none: number; average: string };

export type Facts = {
  organisation: string;
  frameworks: string[];
  confirmed: number;
  awaitingReview: number;
  statusCounts: Record<(typeof STATUS_ORDER)[number], number>;
  /** Share of confirmed controls per status, rounded to whole percent, e.g. "57%". */
  statusPercents: Record<(typeof STATUS_ORDER)[number], string>;
  notScorable: number;
  limitedCoverage: number;
  coverage: FactsFramework[];
  controls: FactsControl[];
  /** Controls with status Gap Identified or any framework rated None. */
  gaps: { id: string; name: string; owner: string | null; status: Status; score: string; notMet: string[] }[];
  owners: string[];
};

const percent = (part: number, whole: number) => `${whole === 0 ? 0 : Math.round((part / whole) * 100)}%`;

/**
 * The minimum the facts pack is built from: confirmed controls (ID, name, owner, one rating per framework) and the
 * number awaiting review. The browser sends this to the report route, and the server rebuilds the facts pack from it
 * with the same code, so the model only ever sees figures computed on the server.
 */
export type FactsInputControl = { id: string; name: string; owner: string | null; ratings: Record<FrameworkId, Rating> };
export type FactsInput = { controls: FactsInputControl[]; awaitingReview: number };

/** Confirmed controls only, in workspace order. N/A reasons are not needed for any figure, so they are left out. */
export function factsInput(ws: Workspace): FactsInput {
  const controls: FactsInputControl[] = [];
  for (const r of ws.controls) {
    const ratings = confirmedRatings(r);
    if (!ratings || !r.confirmed) continue;
    controls.push({
      id: r.id,
      name: r.confirmed.control.name,
      owner: r.confirmed.control.owner?.trim() || null,
      ratings: Object.fromEntries(FRAMEWORK_IDS.map((f) => [f, ratings[f].rating])) as Record<FrameworkId, Rating>,
    });
  }
  return { controls, awaitingReview: ws.controls.length - controls.length };
}

export const buildFacts = (ws: Workspace): Facts => buildFactsFrom(factsInput(ws));

export function buildFactsFrom(input: FactsInput): Facts {
  // The scoring engine needs a reason with N/A; the reason never changes a figure, so a placeholder is used here.
  const ratingsOf = (c: FactsInputControl): ControlRatings =>
    Object.fromEntries(FRAMEWORK_IDS.map((f) => [f, c.ratings[f] === "na" ? { rating: "na", naReason: "N/A" } : { rating: c.ratings[f] }])) as ControlRatings;
  const n = input.controls.length;
  const summary = summarize(input.controls.map((c) => ({ id: c.id, ratings: ratingsOf(c), ids: Object.fromEntries(FRAMEWORK_IDS.map((f) => [f, [] as string[]])) as Record<FrameworkId, string[]> })));
  const statusCounts = {
    "Fully Aligned": summary.statusCounts["Fully Aligned"],
    "Partially Aligned": summary.statusCounts["Partially Aligned"],
    "Gap Identified": summary.statusCounts["Gap Identified"],
  };
  const controls: FactsControl[] = input.controls.map((c) => {
    const result = scoreControl(ratingsOf(c));
    return {
      id: c.id,
      name: c.name,
      owner: c.owner?.trim() || null,
      score: formatScore(result.score),
      status: result.status,
      limitedCoverage: result.limitedCoverage,
      ratings: Object.fromEntries(FRAMEWORK_IDS.map((f) => [FRAMEWORK_NAMES[f], RATING_LABELS[c.ratings[f]]])),
      notMet: FRAMEWORK_IDS.filter((f) => c.ratings[f] === "none").map((f) => FRAMEWORK_NAMES[f]),
    };
  });
  return {
    organisation: ORGANISATION,
    frameworks: FRAMEWORK_IDS.map((f) => FRAMEWORK_NAMES[f]),
    confirmed: n,
    awaitingReview: input.awaitingReview,
    statusCounts,
    statusPercents: Object.fromEntries(STATUS_ORDER.map((s) => [s, percent(statusCounts[s], n)])) as Facts["statusPercents"],
    notScorable: summary.notScorable.length,
    limitedCoverage: summary.controlsWithLimitedCoverage.length,
    coverage: FRAMEWORK_IDS.map((f: FrameworkId) => {
      const fw = summary.frameworks[f];
      return { name: FRAMEWORK_NAMES[f], rated: fw.inScope, na: fw.counts.na, none: fw.counts.none, average: fw.coverage === null ? "n/a" : formatScore(fw.coverage) };
    }),
    controls,
    // Same rule as the matrix's gaps list: status Gap Identified, or any framework rated None.
    gaps: controls
      .filter((c) => c.status === "Gap Identified" || c.notMet.length > 0)
      .map((c) => ({ id: c.id, name: c.name, owner: c.owner, status: c.status, score: c.score, notMet: c.notMet })),
    owners: [...new Set(controls.map((c) => c.owner).filter((o): o is string => Boolean(o)))],
  };
}

/** Every number the report may state: counts, percentages, scores, averages and the scoring rule's values. */
export function allowedNumbers(f: Facts): Set<number> {
  const nums = new Set<number>([f.confirmed, f.awaitingReview, f.notScorable, f.limitedCoverage, f.frameworks.length]);
  for (const s of STATUS_ORDER) {
    nums.add(f.statusCounts[s]);
    nums.add(Number.parseInt(f.statusPercents[s], 10));
  }
  for (const c of f.coverage) {
    [c.rated, c.na, c.none].forEach((v) => nums.add(v));
    if (c.average !== "n/a") nums.add(Number(c.average));
  }
  for (const c of f.controls) if (c.score !== "n/a") nums.add(Number(c.score));
  nums.add(f.gaps.length);
  // The scoring rule: rating values and thresholds.
  Object.values(RATING_HALF_POINTS).forEach((h) => nums.add(h / 2));
  Object.values(THRESHOLDS).forEach((t) => nums.add(t));
  return nums;
}

/** Short stable hash of the confirmed results, used to tell when the report is out of date. */
export function factsFingerprint(f: Facts): string {
  const text = JSON.stringify([f.controls.map((c) => [c.id, c.name, c.owner, c.score, c.status, c.ratings]), f.awaitingReview]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
