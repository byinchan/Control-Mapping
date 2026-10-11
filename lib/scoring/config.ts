// The only place where rating values and status thresholds are defined.
// Thresholds confirmed by Bernadette; change them here and nowhere else.

export const RATINGS = ["full", "partial", "none", "na"] as const;
export type Rating = (typeof RATINGS)[number];

/** Short display labels. The stored values (full, partial, none, na) and the scoring do not change. */
export const RATING_LABELS: Record<Rating, string> = {
  full: "Full",
  partial: "Partial",
  none: "None",
  na: "N/A",
};

/** What each rating means, shown beside its radio button and in the ratings key. */
export const RATING_HELP: Record<Rating, string> = {
  full: "as described, the control meets the requirement(s)",
  partial: "as described, the control meets some of the requirement(s)",
  none: "the framework has a requirement, the control doesn't meet it",
  na: "the framework has no requirement on this topic",
};

/** Scoring effect of each rating, shown for the selected one. Must match RATING_HALF_POINTS. */
export const RATING_EFFECT: Record<Rating, string> = {
  full: "Full scores 1.",
  partial: "Partial scores 0.5.",
  none: "None scores 0.",
  na: "N/A is left out of the score.",
};

/** Rating values in half-points (Full = 1.0, Partial = 0.5, None = 0) so all arithmetic is exact. N/A is excluded. */
export const RATING_HALF_POINTS: Record<Exclude<Rating, "na">, number> = { full: 2, partial: 1, none: 0 };

export const THRESHOLDS = {
  /** Fully Aligned: score >= this and no framework rated None. */
  fullyAlignedMin: 0.9,
  /** Gap Identified: score < this ... */
  gapBelow: 0.4,
  /** ... or any in-scope framework rated None with score < this. */
  gapWithNoneBelow: 0.5,
} as const;

/**
 * "Limited framework coverage" flag: raised when this many or fewer frameworks are in scope
 * (but at least one). It is shown next to the status and never changes the score or status.
 */
export const LIMITED_COVERAGE_MAX_IN_SCOPE = 1;

export const STATUSES =["Fully Aligned", "Partially Aligned", "Gap Identified", "Not scorable"] as const;
export type Status = (typeof STATUSES)[number];

/** How score and status are calculated, in plain words. */
export const SCORING_RULE_TEXT = [
  "Control score = average of the rated frameworks (Full 1, Partial 0.5, None 0; N/A left out).",
  `Fully Aligned: score ${THRESHOLDS.fullyAlignedMin} or higher and no framework rated None.`,
  `Gap Identified: score below ${THRESHOLDS.gapBelow}, or any framework rated None with a score below ${THRESHOLDS.gapWithNoneBelow}.`,
  "Partially Aligned: everything else.",
  "Not scorable: every framework is N/A.",
  "Limited framework coverage (flag, not a status): only one framework is rated, so the result rests on a single framework.",
] as const;
