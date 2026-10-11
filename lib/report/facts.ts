// The report's facts pack: every figure and name the report may state, computed by code from
// CONFIRMED controls only. The narrative (template or AI) may quote these figures, never compute new ones.
import { FRAMEWORK_NAMES } from "../catalog/names.ts";
import { FRAMEWORK_IDS, type FrameworkId } from "../catalog/types.ts";
import { buildResults } from "../results/matrix.ts";
import { RATING_HALF_POINTS, RATING_LABELS, THRESHOLDS, type Status } from "../scoring/config.ts";
import { formatScore } from "../scoring/score.ts";
import type { Workspace } from "../workflow/workspace.ts";

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

export function buildFacts(ws: Workspace): Facts {
  const results = buildResults(ws);
  const n = results.rows.length;
  const statusCounts = {
    "Fully Aligned": results.summary.statusCounts["Fully Aligned"],
    "Partially Aligned": results.summary.statusCounts["Partially Aligned"],
    "Gap Identified": results.summary.statusCounts["Gap Identified"],
  };
  const controls: FactsControl[] = results.rows.map((row) => ({
    id: row.id,
    name: row.control.name,
    owner: row.control.owner?.trim() || null,
    score: formatScore(row.score),
    status: row.status,
    limitedCoverage: row.limitedCoverage,
    ratings: Object.fromEntries(FRAMEWORK_IDS.map((f) => [FRAMEWORK_NAMES[f], RATING_LABELS[row.cells[f].rating]])),
    notMet: FRAMEWORK_IDS.filter((f) => row.cells[f].rating === "none").map((f) => FRAMEWORK_NAMES[f]),
  }));
  return {
    organisation: ORGANISATION,
    frameworks: FRAMEWORK_IDS.map((f) => FRAMEWORK_NAMES[f]),
    confirmed: n,
    awaitingReview: results.awaitingReview,
    statusCounts,
    statusPercents: Object.fromEntries(STATUS_ORDER.map((s) => [s, percent(statusCounts[s], n)])) as Facts["statusPercents"],
    notScorable: results.summary.notScorable.length,
    limitedCoverage: results.summary.controlsWithLimitedCoverage.length,
    coverage: FRAMEWORK_IDS.map((f: FrameworkId) => {
      const fw = results.summary.frameworks[f];
      return { name: FRAMEWORK_NAMES[f], rated: fw.inScope, na: fw.counts.na, none: fw.counts.none, average: fw.coverage === null ? "n/a" : formatScore(fw.coverage) };
    }),
    controls,
    gaps: results.gaps.map((g) => ({
      id: g.id,
      name: g.name,
      owner: controls.find((c) => c.id === g.id)?.owner ?? null,
      status: g.status,
      score: formatScore(g.score),
      notMet: g.noneFrameworks.map((nf) => FRAMEWORK_NAMES[nf.framework]),
    })),
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
