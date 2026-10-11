// Results from CONFIRMED controls only: the matrix, totals, gaps and check items.
// Pure functions. Every score and status comes from the scoring engine; nothing is decided here.
import { FRAMEWORK_IDS, type FrameworkId } from "../catalog/types.ts";
import type { ControlInput } from "../mapping/types.ts";
import type { Rating, Status } from "../scoring/config.ts";
import { scoreControl, summarize, type ConfirmedControl, type Summary } from "../scoring/score.ts";
import { confirmedRatings, type Workspace } from "../workflow/workspace.ts";

export type MatrixCell = { rating: Rating; ids: string[]; rationale: string; naReason: string };

export type MatrixRow = {
  id: string;
  /** Control text as confirmed. */
  control: ControlInput;
  cells: Record<FrameworkId, MatrixCell>;
  score: number | null;
  status: Status;
  limitedCoverage: boolean;
  confirmedAt: string;
};

/** A control in the gaps list: status Gap Identified, and/or rated None on at least one framework. */
export type GapItem = {
  id: string;
  name: string;
  score: number | null;
  status: Status;
  /** True when the status itself is Gap Identified. */
  gapStatus: boolean;
  /** Frameworks rated None: the framework has a requirement the control doesn't meet. */
  noneFrameworks: { framework: FrameworkId; ids: string[]; rationale: string }[];
};

/** Something to check that is not a gap: the result rests on one framework, or on none. */
export type CheckItem = {
  id: string;
  name: string;
  kind: "limited-coverage" | "not-scorable";
  /** The frameworks rated N/A, with the analyst's reasons. */
  naFrameworks: { framework: FrameworkId; reason: string }[];
};

export type Results = {
  rows: MatrixRow[];
  /** Controls in the tab that are not confirmed; never scored or shown in the matrix. */
  awaitingReview: number;
  summary: Summary;
  gaps: GapItem[];
  checks: CheckItem[];
};

export function buildResults(ws: Workspace): Results {
  const rows: MatrixRow[] = [];
  const confirmed: ConfirmedControl[] = [];

  for (const r of ws.controls) {
    const ratings = confirmedRatings(r);
    if (!ratings || !r.confirmed) continue;
    const c = r.confirmed;
    const result = scoreControl(ratings);
    rows.push({
      id: r.id,
      control: c.control,
      cells: Object.fromEntries(FRAMEWORK_IDS.map((f) => [f, { ...c.mapping[f], ids: [...c.mapping[f].ids] }])) as MatrixRow["cells"],
      score: result.score,
      status: result.status,
      limitedCoverage: result.limitedCoverage,
      confirmedAt: c.at,
    });
    confirmed.push({ id: r.id, ratings, ids: Object.fromEntries(FRAMEWORK_IDS.map((f) => [f, c.mapping[f].ids])) as ConfirmedControl["ids"] });
  }

  const gaps: GapItem[] = [];
  const checks: CheckItem[] = [];
  for (const row of rows) {
    const noneFrameworks = FRAMEWORK_IDS.filter((f) => row.cells[f].rating === "none").map((f) => ({
      framework: f,
      ids: row.cells[f].ids,
      rationale: row.cells[f].rationale,
    }));
    const gapStatus = row.status === "Gap Identified";
    if (gapStatus || noneFrameworks.length > 0) {
      gaps.push({ id: row.id, name: row.control.name, score: row.score, status: row.status, gapStatus, noneFrameworks });
    }
    if (row.limitedCoverage || row.status === "Not scorable") {
      checks.push({
        id: row.id,
        name: row.control.name,
        kind: row.status === "Not scorable" ? "not-scorable" : "limited-coverage",
        naFrameworks: FRAMEWORK_IDS.filter((f) => row.cells[f].rating === "na").map((f) => ({ framework: f, reason: row.cells[f].naReason })),
      });
    }
  }

  return {
    rows,
    awaitingReview: ws.controls.length - rows.length,
    summary: summarize(confirmed),
    gaps,
    checks,
  };
}
