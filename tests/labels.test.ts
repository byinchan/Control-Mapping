import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_LABELS, CONFIRM_LABELS } from "../app/components/labels.ts";
import { SCORING_RULE_TEXT, THRESHOLDS } from "../lib/scoring/config.ts";

test("confirm bar labels", () => {
  assert.equal(CONFIRM_LABELS.confirm, "Confirm this control");
  assert.equal(CONFIRM_LABELS.confirmAndNext, "Confirm and go to next control");
  assert.equal(CONFIRM_LABELS.barText("C005"), "C005: confirming records your decision");
});

test("AI button labels", () => {
  assert.deepEqual(AI_LABELS, {
    mapAll: "Ask AI to map controls",
    mapOne: "Ask AI to map this control",
    replace: "Replace with a new AI suggestion",
  });
});

test("scoring rule text: average with per-rating values, thresholds, Not scorable and limited coverage", () => {
  const text = SCORING_RULE_TEXT.join("\n");
  assert.equal(SCORING_RULE_TEXT[0], "Control score = average of the rated frameworks (Full 1, Partial 0.5, None 0; N/A left out).");
  assert.ok(text.includes(String(THRESHOLDS.fullyAlignedMin)));
  assert.ok(text.includes(String(THRESHOLDS.gapBelow)));
  assert.ok(text.includes(String(THRESHOLDS.gapWithNoneBelow)));
  assert.match(text, /Not scorable/);
  assert.match(text, /Limited framework coverage/);
});
