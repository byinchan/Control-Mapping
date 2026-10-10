import { test } from "node:test";
import assert from "node:assert/strict";
import corrections from "../data/sample-corrections.json" with { type: "json" };
import v1 from "../data/v1-controls.json" with { type: "json" };
import draft from "../data/v1-ratings.draft.json" with { type: "json" };
import expected from "./fixtures/backtest.expected.json" with { type: "json" };
import { backtestV1, type DraftRatings } from "../lib/backtest.ts";
import { FRAMEWORK_IDS } from "../lib/catalog/types.ts";
import { applySampleCorrections, type SampleCorrection, type V1Control } from "../lib/sample.ts";
import { validateRatings } from "../lib/scoring/score.ts";

const ratings = draft as unknown as DraftRatings;
const sample = applySampleCorrections(v1.controls as V1Control[], corrections.corrections as SampleCorrection[]);

test("draft ratings cover all 14 controls x 4 frameworks and are all marked draft", () => {
  assert.equal(draft.status, "draft, pending Bernadette");
  assert.deepEqual(Object.keys(draft.controls), v1.controls.map((c) => c.id));
  for (const [id, cells] of Object.entries(draft.controls)) {
    assert.deepEqual(validateRatings(cells), [], id);
    for (const f of FRAMEWORK_IDS) {
      const cell = (cells as Record<string, { status: string; basis: string }>)[f];
      assert.equal(cell.status, "draft, pending Bernadette", `${id} ${f}`);
      assert.ok(cell.basis.trim().length > 0, `${id} ${f} needs a basis`);
    }
  }
});

test("N/A in the draft exactly where the sample says N/A, with the v1 reason verbatim", () => {
  for (const control of sample) {
    for (const f of FRAMEWORK_IDS) {
      const cell = control.frameworks[f];
      const rating = ratings.controls[control.id][f];
      if (cell.kind === "na") {
        assert.equal(rating.rating, "na", `${control.id} ${f}`);
        assert.equal(rating.naReason, cell.reason, `${control.id} ${f}`);
      } else {
        assert.notEqual(rating.rating, "na", `${control.id} ${f} has mapped IDs`);
      }
    }
  }
});

test("re-rated cells cite their corrected mapping", () => {
  for (const c of corrections.corrections) {
    const cell = (draft.controls as Record<string, Record<string, { basis: string }>>)[c.control][c.framework];
    assert.match(cell.basis, /^Corrected mapping /, `${c.control} ${c.framework}`);
    for (const id of c.corrected) assert.ok(cell.basis.includes(id), `${c.control} basis names ${id}`);
  }
});

test("back-test matches the committed snapshot (any rule, mapping or rating change shows in the diff)", () => {
  const rows = backtestV1(sample, ratings).map(({ id, v1Status, ruleStatus, score, agrees, limitedCoverage, correctedFrameworks }) => ({
    id,
    v1Status,
    ruleStatus,
    score,
    agrees,
    limitedCoverage,
    correctedFrameworks,
  }));
  assert.deepEqual(rows, expected);
});

test("C014 AI Governance: N/A frameworks are excluded, NIST alone decides, and the limited-coverage flag is raised", () => {
  const rows = backtestV1(sample, ratings);
  const c014 = rows.find((r) => r.id === "C014");
  assert.equal(c014?.v1Status, "Gap Identified");
  assert.equal(c014?.ruleStatus, "Partially Aligned");
  assert.equal(c014?.limitedCoverage, true);
  assert.match(c014?.explanation ?? "", /N\/A excluded: iso-27001-2022, cis-v8.1, soc2-tsc-2017/);
  assert.match(c014?.explanation ?? "", /flag: limited framework coverage/);
  assert.deepEqual(rows.filter((r) => r.limitedCoverage).map((r) => r.id), ["C014"]);
});
