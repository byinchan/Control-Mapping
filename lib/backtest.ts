import { FRAMEWORK_IDS, type FrameworkId } from "./catalog/types.ts";
import type { Rating, Status } from "./scoring/config.ts";
import { formatScore, scoreControl, type ControlRatings } from "./scoring/score.ts";

export type BacktestInputControl = { id: string; name: string; v1Status: string };

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
  /** Plain explanation of how the rule reached its status. */
  explanation: string;
};

function toControlRatings(raw: DraftRatings["controls"][string]): ControlRatings {
  return Object.fromEntries(
    FRAMEWORK_IDS.map((f) => [f, { rating: raw[f].rating, naReason: raw[f].naReason }]),
  ) as ControlRatings;
}

function explain(ratings: ControlRatings, score: number | null, status: Status): string {
  const na = FRAMEWORK_IDS.filter((f) => ratings[f].rating === "na");
  const nones = FRAMEWORK_IDS.filter((f) => ratings[f].rating === "none");
  const parts: string[] = [];
  if (score === null) parts.push("every framework is N/A");
  else parts.push(`score ${formatScore(score)} over ${FRAMEWORK_IDS.length - na.length} framework(s)`);
  if (na.length) parts.push(`N/A excluded: ${na.join(", ")}`);
  if (nones.length) parts.push(`None: ${nones.join(", ")}`);
  parts.push(`-> ${status}`);
  return parts.join("; ");
}

/** Applies the scoring rule to the v1 controls and compares with the v1 analyst labels. */
export function backtestV1(controls: readonly BacktestInputControl[], ratings: DraftRatings): BacktestRow[] {
  return controls.map((c) => {
    const raw = ratings.controls[c.id];
    if (!raw) throw new Error(`No ratings for ${c.id}`);
    const r = toControlRatings(raw);
    const { score, status } = scoreControl(r);
    return {
      id: c.id,
      name: c.name,
      v1Status: c.v1Status,
      ruleStatus: status,
      score,
      agrees: status === c.v1Status,
      explanation: explain(r, score, status),
    };
  });
}
