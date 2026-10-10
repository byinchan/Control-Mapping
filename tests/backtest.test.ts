import { test } from "node:test";
import assert from "node:assert/strict";
import v1 from "../data/v1-controls.json" with { type: "json" };
import draft from "../data/v1-ratings.draft.json" with { type: "json" };
import expected from "./fixtures/backtest.expected.json" with { type: "json" };
import { backtestV1, type DraftRatings } from "../lib/backtest.ts";
import { FRAMEWORK_IDS } from "../lib/catalog/types.ts";
import type { V1Cell } from "../lib/catalog/v1.ts";
import { validateRatings } from "../lib/scoring/score.ts";

const ratings = draft as unknown as DraftRatings;

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

test("N/A in the draft exactly where v1 says N/A, with the v1 reason verbatim", () => {
  for (const control of v1.controls) {
    for (const f of FRAMEWORK_IDS) {
      const parsed = control.frameworks[f].parsed as V1Cell;
      const cell = ratings.controls[control.id][f];
      if (parsed.kind === "na") {
        assert.equal(cell.rating, "na", `${control.id} ${f}`);
        assert.equal(cell.naReason, parsed.reason, `${control.id} ${f}`);
      } else {
        assert.notEqual(cell.rating, "na", `${control.id} ${f} has mapped IDs`);
      }
    }
  }
});

test("back-test matches the committed snapshot (any rule or rating change shows in the diff)", () => {
  const rows = backtestV1(v1.controls, ratings).map(({ id, v1Status, ruleStatus, score, agrees }) => ({
    id,
    v1Status,
    ruleStatus,
    score,
    agrees,
  }));
  assert.deepEqual(rows, expected);
});

test("AI Governance (C014) is a disclosed disagreement: N/A frameworks are excluded, so NIST alone decides", () => {
  const c014 = backtestV1(v1.controls, ratings).find((r) => r.id === "C014");
  assert.equal(c014?.v1Status, "Gap Identified");
  assert.equal(c014?.ruleStatus, "Partially Aligned");
  assert.match(c014?.explanation ?? "", /N\/A excluded: iso-27001-2022, cis-v8.1, soc2-tsc-2017/);
});
