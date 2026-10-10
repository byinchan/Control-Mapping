import { test } from "node:test";
import assert from "node:assert/strict";
import { FRAMEWORK_IDS, type FrameworkId } from "../lib/catalog/types.ts";
import { RATINGS, STATUSES, type Rating, type Status } from "../lib/scoring/config.ts";
import {
  formatScore,
  scoreControl,
  statusFor,
  summarize,
  validateRatings,
  type ControlRatings,
  type ConfirmedControl,
} from "../lib/scoring/score.ts";

const [NIST, ISO, CIS, SOC2] = FRAMEWORK_IDS;

/** Builds ratings from four values in framework order; N/A gets a reason. */
function r(...values: Rating[]): ControlRatings {
  return Object.fromEntries(
    FRAMEWORK_IDS.map((f, i) => [f, values[i] === "na" ? { rating: "na", naReason: "Not applicable" } : { rating: values[i] }]),
  ) as ControlRatings;
}

const RANK: Record<Status, number> = { "Gap Identified": 0, "Partially Aligned": 1, "Fully Aligned": 2, "Not scorable": -1 };

test("threshold boundaries are exact (score = halfPoints / (2 * inScope))", () => {
  // 0.9 exactly (9 half-points over 5 frameworks) is Fully Aligned; just below is not.
  assert.equal(statusFor(9, 5, false), "Fully Aligned");
  assert.equal(statusFor(17, 10, false), "Partially Aligned"); // 0.85
  assert.equal(statusFor(9, 5, true), "Partially Aligned"); // a None blocks Fully Aligned
  // 0.4 exactly is not a gap; below 0.4 is.
  assert.equal(statusFor(4, 5, false), "Partially Aligned");
  assert.equal(statusFor(3, 4, false), "Gap Identified"); // 0.375
  // With a None: 0.5 exactly is not a gap; below 0.5 is.
  assert.equal(statusFor(2, 2, true), "Partially Aligned");
  assert.equal(statusFor(7, 8, true), "Gap Identified"); // 0.4375
  assert.equal(statusFor(7, 8, false), "Partially Aligned"); // same score without None
  assert.equal(statusFor(0, 0, false), "Not scorable");
});

test("worked examples", () => {
  assert.deepEqual(scoreControl(r("full", "full", "full", "full")), { score: 1, inScope: 4, hasNone: false, status: "Fully Aligned", limitedCoverage: false });
  assert.equal(scoreControl(r("full", "full", "full", "partial")).status, "Partially Aligned"); // 0.875
  assert.equal(scoreControl(r("full", "full", "full", "na")).status, "Fully Aligned"); // N/A excluded
  assert.equal(scoreControl(r("full", "none", "full", "full")).status, "Partially Aligned"); // 0.75 with None
  assert.equal(scoreControl(r("full", "none", "none", "na")).status, "Gap Identified"); // 0.333
  assert.equal(scoreControl(r("partial", "none", "na", "na")).status, "Gap Identified"); // 0.25
  assert.equal(scoreControl(r("full", "none", "na", "na")).status, "Partially Aligned"); // 0.5 with None
  assert.equal(scoreControl(r("partial", "na", "na", "na")).status, "Partially Aligned"); // one framework in scope
  assert.deepEqual(scoreControl(r("na", "na", "na", "na")), { score: null, inScope: 0, hasNone: false, status: "Not scorable", limitedCoverage: false });
});

test("limited framework coverage is a flag, not a status: it never changes score or status", () => {
  const one = scoreControl(r("partial", "na", "na", "na"));
  assert.equal(one.limitedCoverage, true);
  assert.equal(one.status, "Partially Aligned");
  assert.equal(one.score, 0.5);
  assert.equal(scoreControl(r("full", "na", "na", "na")).status, "Fully Aligned");
  assert.equal(scoreControl(r("none", "na", "na", "na")).status, "Gap Identified");
  assert.equal(scoreControl(r("partial", "partial", "na", "na")).limitedCoverage, false);
  assert.equal(scoreControl(r("na", "na", "na", "na")).limitedCoverage, false); // Not scorable instead
  const ids = Object.fromEntries(FRAMEWORK_IDS.map((f) => [f, []])) as unknown as Record<FrameworkId, string[]>;
  assert.deepEqual(summarize([{ id: "X", ratings: r("na", "full", "na", "na"), ids }]).controlsWithLimitedCoverage, ["X"]);
});

test("validateRatings requires every framework and a reason for N/A", () => {
  assert.deepEqual(validateRatings(r("full", "partial", "none", "na")), []);
  const noReason = { ...r("full", "full", "full", "full"), [CIS]: { rating: "na" } };
  assert.deepEqual(validateRatings(noReason), ["cis-v8.1: N/A needs a reason"]);
  const blankReason = { ...r("full", "full", "full", "full"), [CIS]: { rating: "na", naReason: "  " } };
  assert.deepEqual(validateRatings(blankReason), ["cis-v8.1: N/A needs a reason"]);
  const { [SOC2]: _, ...missing } = r("full", "full", "full", "full");
  assert.deepEqual(validateRatings(missing), ["soc2-tsc-2017: missing or invalid rating"]);
  assert.deepEqual(validateRatings({ ...r("full", "full", "full", "full"), [NIST]: { rating: "high" } }), [
    "nist-csf-2.0: missing or invalid rating",
  ]);
  assert.deepEqual(validateRatings(null), ["ratings must be an object"]);
  assert.throws(() => scoreControl(noReason as ControlRatings), /N\/A needs a reason/);
});

test("exhaustive sweep of all 4^4 = 256 rating combinations holds the rule's invariants", () => {
  const VALUE: Record<Exclude<Rating, "na">, number> = { full: 1, partial: 0.5, none: 0 };
  const UPGRADE: Partial<Record<Rating, Rating>> = { none: "partial", partial: "full" };
  let count = 0;
  for (const a of RATINGS) for (const b of RATINGS) for (const c of RATINGS) for (const d of RATINGS) {
    const values: Rating[] = [a, b, c, d];
    const result = scoreControl(r(...values));
    const inScope = values.filter((v) => v !== "na") as Exclude<Rating, "na">[];
    count += 1;

    assert.ok(STATUSES.includes(result.status));
    assert.equal(result.status === "Not scorable", inScope.length === 0);
    if (inScope.length > 0) {
      const mean = inScope.reduce((s, v) => s + VALUE[v], 0) / inScope.length;
      assert.ok(Math.abs((result.score as number) - mean) < 1e-12, "N/A never changes the score");
    }
    if (result.status === "Fully Aligned") assert.ok(!result.hasNone && (result.score as number) >= 0.9);
    if (result.hasNone && result.status !== "Not scorable") assert.notEqual(result.status, "Fully Aligned");
    // The limited-coverage flag is raised exactly when one framework is in scope.
    assert.equal(result.limitedCoverage, inScope.length === 1);
    // With at most four frameworks, Fully Aligned means every in-scope framework is Full.
    assert.equal(result.status === "Fully Aligned", inScope.length > 0 && inScope.every((v) => v === "full"));

    values.forEach((v, i) => {
      // Upgrading one rating never worsens the status.
      const up = UPGRADE[v];
      if (up) {
        const better = scoreControl(r(...values.map((x, j) => (j === i ? up : x))));
        assert.ok(RANK[better.status] >= RANK[result.status], `${values} -> upgrade ${i}`);
      }
      // Bringing an N/A framework into scope as Full never lowers the score.
      if (v === "na" && result.score !== null) {
        const withFull = scoreControl(r(...values.map((x, j) => (j === i ? "full" : x))));
        assert.ok((withFull.score as number) >= result.score);
      }
    });
  }
  assert.equal(count, 256);
});

test("summarize counts statuses, coverage and Nones over confirmed controls", () => {
  const ids = (n: number) => Object.fromEntries(FRAMEWORK_IDS.map((f) => [f, n ? ["X"] : []])) as Record<FrameworkId, string[]>;
  const controls: ConfirmedControl[] = [
    { id: "A", ratings: r("full", "full", "full", "full"), ids: ids(1) },
    { id: "B", ratings: r("full", "none", "partial", "na"), ids: { ...ids(1), [SOC2]: [] } },
    { id: "C", ratings: r("none", "none", "na", "na"), ids: { ...ids(1), [CIS]: [], [SOC2]: [] } },
    { id: "D", ratings: r("na", "na", "na", "na"), ids: ids(0) },
  ];
  const s = summarize(controls);
  assert.deepEqual(s.statusCounts, { "Fully Aligned": 1, "Partially Aligned": 1, "Gap Identified": 1 });
  assert.deepEqual(s.notScorable, ["D"]);
  assert.deepEqual(s.controlsWithNone, ["B", "C"]);
  assert.deepEqual(s.controlsWithLimitedCoverage, []);
  assert.deepEqual(s.frameworks[NIST], { inScope: 3, mapped: 3, counts: { full: 2, partial: 0, none: 1, na: 1 }, coverage: 2 / 3 });
  assert.deepEqual(s.frameworks[ISO].coverage, 1 / 3);
  assert.deepEqual(s.frameworks[CIS], { inScope: 2, mapped: 2, counts: { full: 1, partial: 1, none: 0, na: 2 }, coverage: 0.75 });
  assert.equal(s.frameworks[SOC2].coverage, 1);
  assert.equal(summarize([]).frameworks[NIST].coverage, null);
});

test("formatScore shows up to three decimals", () => {
  assert.equal(formatScore(5 / 6), "0.833");
  assert.equal(formatScore(0.5), "0.5");
  assert.equal(formatScore(1), "1");
  assert.equal(formatScore(null), "n/a");
});
