import { FRAMEWORK_IDS, type FrameworkId } from "../catalog/types.ts";
import { RATINGS, RATING_HALF_POINTS, THRESHOLDS, type Rating, type Status } from "./config.ts";

export type FrameworkRating = {
  rating: Rating;
  /** Required when rating is "na". */
  naReason?: string;
};

export type ControlRatings = Record<FrameworkId, FrameworkRating>;

export type ControlScore = {
  /** Mean of in-scope framework values, or null when every framework is N/A. */
  score: number | null;
  inScope: number;
  hasNone: boolean;
  status: Status;
};

// Thresholds as whole hundredths so comparisons are exact integer arithmetic.
const hundredths = (x: number) => {
  const h = Math.round(x * 100);
  if (Math.abs(h - x * 100) > 1e-9) throw new Error(`Threshold ${x} must have at most two decimals`);
  return h;
};
const FULLY_MIN = hundredths(THRESHOLDS.fullyAlignedMin);
const GAP_BELOW = hundredths(THRESHOLDS.gapBelow);
const GAP_WITH_NONE_BELOW = hundredths(THRESHOLDS.gapWithNoneBelow);

/** Returns a list of problems with a control's ratings; empty means valid. */
export function validateRatings(ratings: unknown): string[] {
  if (typeof ratings !== "object" || ratings === null) return ["ratings must be an object"];
  const errors: string[] = [];
  for (const framework of FRAMEWORK_IDS) {
    const r = (ratings as Record<string, unknown>)[framework] as FrameworkRating | undefined;
    if (!r || !RATINGS.includes(r.rating)) {
      errors.push(`${framework}: missing or invalid rating`);
    } else if (r.rating === "na" && !(typeof r.naReason === "string" && r.naReason.trim())) {
      errors.push(`${framework}: N/A needs a reason`);
    }
  }
  return errors;
}

/** Display form of a score: up to three decimals, no trailing zeros. */
export function formatScore(score: number | null): string {
  return score === null ? "n/a" : String(Number(score.toFixed(3)));
}

/**
 * Applies the status rule to an exact score of halfPoints / (2 * inScope).
 * Exported so the threshold boundaries can be tested directly.
 */
export function statusFor(halfPoints: number, inScope: number, hasNone: boolean): Status {
  if (inScope === 0) return "Not scorable";
  // score * 100 compared against thresholds in hundredths, without division.
  const score100 = halfPoints * 100;
  const denominator = 2 * inScope;
  const atLeast = (h: number) => score100 >= h * denominator;
  const below = (h: number) => score100 < h * denominator;
  if (atLeast(FULLY_MIN) && !hasNone) return "Fully Aligned";
  if (below(GAP_BELOW) || (hasNone && below(GAP_WITH_NONE_BELOW))) return "Gap Identified";
  return "Partially Aligned";
}

export function scoreControl(ratings: ControlRatings): ControlScore {
  const problems = validateRatings(ratings);
  if (problems.length > 0) throw new Error(`Invalid ratings: ${problems.join("; ")}`);

  let halfPoints = 0;
  let inScope = 0;
  let hasNone = false;
  for (const framework of FRAMEWORK_IDS) {
    const { rating } = ratings[framework];
    if (rating === "na") continue;
    inScope += 1;
    halfPoints += RATING_HALF_POINTS[rating];
    if (rating === "none") hasNone = true;
  }
  const status = statusFor(halfPoints, inScope, hasNone);
  return { score: inScope === 0 ? null : halfPoints / (2 * inScope), inScope, hasNone, status };
}

export type ConfirmedControl = {
  id: string;
  ratings: ControlRatings;
  /** Confirmed requirement IDs per framework (empty for N/A). */
  ids: Record<FrameworkId, string[]>;
};

export type FrameworkCoverage = {
  inScope: number;
  /** Controls with at least one mapped ID for this framework. */
  mapped: number;
  counts: Record<Rating, number>;
  /** Mean rating over in-scope controls, or null when none are in scope. */
  coverage: number | null;
};

export type Summary = {
  statusCounts: Record<Exclude<Status, "Not scorable">, number>;
  notScorable: string[];
  controlsWithNone: string[];
  frameworks: Record<FrameworkId, FrameworkCoverage>;
};

/** Aggregates over confirmed controls only; the caller must not pass unconfirmed ones. */
export function summarize(controls: readonly ConfirmedControl[]): Summary {
  const statusCounts = { "Fully Aligned": 0, "Partially Aligned": 0, "Gap Identified": 0 };
  const notScorable: string[] = [];
  const controlsWithNone: string[] = [];
  const frameworks = Object.fromEntries(
    FRAMEWORK_IDS.map((f) => [f, { inScope: 0, mapped: 0, counts: { full: 0, partial: 0, none: 0, na: 0 }, coverage: null }]),
  ) as Record<FrameworkId, FrameworkCoverage>;
  const halfPoints = Object.fromEntries(FRAMEWORK_IDS.map((f) => [f, 0])) as Record<FrameworkId, number>;

  for (const control of controls) {
    const result = scoreControl(control.ratings);
    if (result.status === "Not scorable") notScorable.push(control.id);
    else statusCounts[result.status] += 1;
    if (result.hasNone) controlsWithNone.push(control.id);

    for (const f of FRAMEWORK_IDS) {
      const { rating } = control.ratings[f];
      const fw = frameworks[f];
      fw.counts[rating] += 1;
      if ((control.ids[f] ?? []).length > 0) fw.mapped += 1;
      if (rating !== "na") {
        fw.inScope += 1;
        halfPoints[f] += RATING_HALF_POINTS[rating];
      }
    }
  }
  for (const f of FRAMEWORK_IDS) {
    const fw = frameworks[f];
    fw.coverage = fw.inScope > 0 ? halfPoints[f] / (2 * fw.inScope) : null;
  }
  return { statusCounts, notScorable, controlsWithNone, frameworks };
}
