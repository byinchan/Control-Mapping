import { FRAMEWORK_IDS, type FrameworkId } from "./catalog/types.ts";
import type { Rating, Status } from "./scoring/config.ts";
import { formatScore, scoreControl, type ControlRatings, type ControlScore } from "./scoring/score.ts";

export type BacktestInputControl = {
  id: string;
  name: string;
  v1Status: string;
  /** Frameworks whose sample mapping was corrected after v1 (see data/sample-corrections.json). */
  correctedFrameworks?: readonly FrameworkId[];
};

export type DraftRatings = {
  controls: Record<string, Record<FrameworkId, { rating: Rating; naReason?: string }>>;
};

export type BacktestRow = {
  id: string;
  name: string;
  v1Status: string;
  ruleStatus: Status;
  score: number | null;
  agrees: boolean;
  limitedCoverage: boolean;
  correctedFrameworks: FrameworkId[];
  /** Plain explanation of how the rule reached its status. */
  explanation: string;
};

function toControlRatings(raw: DraftRatings["controls"][string]): ControlRatings {
  return Object.fromEntries(
    FRAMEWORK_IDS.map((f) => [f, { rating: raw[f].rating, naReason: raw[f].naReason }]),
  ) as ControlRatings;
}

function explain(ratings: ControlRatings, result: ControlScore, corrected: readonly FrameworkId[]): string {
  const na = FRAMEWORK_IDS.filter((f) => ratings[f].rating === "na");
  const nones = FRAMEWORK_IDS.filter((f) => ratings[f].rating === "none");
  const parts: string[] = [];
  if (result.score === null) parts.push("every framework is N/A");
  else parts.push(`score ${formatScore(result.score)} over ${result.inScope} framework(s)`);
  if (na.length) parts.push(`N/A excluded: ${na.join(", ")}`);
  if (nones.length) parts.push(`None: ${nones.join(", ")}`);
  if (corrected.length) parts.push(`mapping corrected: ${corrected.join(", ")}`);
  parts.push(`-> ${result.status}`);
  if (result.limitedCoverage) parts.push("flag: limited framework coverage");
  return parts.join("; ");
}

/** Applies the scoring rule to the sample controls and compares with the v1 analyst labels. */
export function backtestV1(controls: readonly BacktestInputControl[], ratings: DraftRatings): BacktestRow[] {
  return controls.map((c) => {
    const raw = ratings.controls[c.id];
    if (!raw) throw new Error(`No ratings for ${c.id}`);
    const r = toControlRatings(raw);
    const result = scoreControl(r);
    const correctedFrameworks = [...(c.correctedFrameworks ?? [])];
    return {
      id: c.id,
      name: c.name,
      v1Status: c.v1Status,
      ruleStatus: result.status,
      score: result.score,
      agrees: result.status === c.v1Status,
      limitedCoverage: result.limitedCoverage,
      correctedFrameworks,
      explanation: explain(r, result, correctedFrameworks),
    };
  });
}
