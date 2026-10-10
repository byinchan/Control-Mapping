import { test } from "node:test";
import assert from "node:assert/strict";
import { ID_INDEX } from "../lib/catalog/catalogs.ts";
import { FRAMEWORK_IDS, type FrameworkId } from "../lib/catalog/types.ts";
import { CSV_HEADERS, csvCell, csvFileName, matrixCsv } from "../lib/results/csv.ts";
import { buildResults } from "../lib/results/matrix.ts";
import type { Rating } from "../lib/scoring/config.ts";
import { PUC_SAMPLES } from "../lib/workflow/samples.ts";
import { addControl, confirmControl, editFramework, emptyWorkspace, loadSample, reopenControl, type Workspace } from "../lib/workflow/workspace.ts";

const T = "2026-10-10T14:05:09.000Z";
const [NIST, ISO, CIS, SOC2] = FRAMEWORK_IDS;
const IDS: Record<FrameworkId, string> = { [NIST]: "PR.AA-03", [ISO]: "A.8.5", [CIS]: "6.3", [SOC2]: "CC6.1" } as Record<FrameworkId, string>;

/** Rates all four frameworks of a control (in framework order) and confirms it. */
function rateAndConfirm(ws: Workspace, id: string, ratings: Rating[]): Workspace {
  FRAMEWORK_IDS.forEach((f, i) => {
    const rating = ratings[i];
    ws = editFramework(
      ws,
      id,
      f,
      rating === "na" ? { rating, ids: [], naReason: "Nothing on this topic", rationale: "" } : { rating, ids: [IDS[f]], rationale: `Why ${rating}` },
      T,
    );
  });
  const res = confirmControl(ws, id, ID_INDEX, T);
  assert.deepEqual(res.blockers, [], id);
  return res.ws;
}

test("results: only confirmed controls appear; awaiting review is counted, not scored", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES.slice(0, 3), T);
  ws = rateAndConfirm(ws, "C001", ["full", "partial", "full", "full"]);
  const r = buildResults(ws);
  assert.deepEqual(r.rows.map((x) => x.id), ["C001"]);
  assert.equal(r.awaitingReview, 2);
  assert.equal(r.rows[0].score, 0.875);
  assert.equal(r.rows[0].status, "Partially Aligned");
  assert.deepEqual(r.summary.statusCounts, { "Fully Aligned": 0, "Partially Aligned": 1, "Gap Identified": 0 });
  // Reopening takes it out of the results until it is confirmed again.
  const reopened = buildResults(reopenControl(ws, "C001", T));
  assert.equal(reopened.rows.length, 0);
  assert.equal(reopened.awaitingReview, 3);
});

test("results: an empty or fully unconfirmed workspace has no rows and no gaps", () => {
  const r = buildResults(loadSample(emptyWorkspace(), PUC_SAMPLES.slice(0, 2), T));
  assert.deepEqual([r.rows.length, r.gaps.length, r.checks.length, r.awaitingReview], [0, 0, 0, 2]);
});

test("results: scores and statuses come from the scoring engine", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES.slice(0, 4), T);
  ws = rateAndConfirm(ws, "C001", ["full", "full", "full", "full"]); // 1 -> Fully Aligned
  ws = rateAndConfirm(ws, "C002", ["full", "none", "full", "full"]); // 0.75 with None -> Partially Aligned
  ws = rateAndConfirm(ws, "C003", ["none", "partial", "none", "na"]); // 0.167 -> Gap Identified
  ws = rateAndConfirm(ws, "C004", ["partial", "na", "na", "na"]); // one framework -> limited coverage
  const r = buildResults(ws);
  assert.deepEqual(
    r.rows.map((x) => [x.id, x.status, x.limitedCoverage]),
    [
      ["C001", "Fully Aligned", false],
      ["C002", "Partially Aligned", false],
      ["C003", "Gap Identified", false],
      ["C004", "Partially Aligned", true],
    ],
  );
  assert.deepEqual(r.summary.statusCounts, { "Fully Aligned": 1, "Partially Aligned": 2, "Gap Identified": 1 });
  assert.equal(r.summary.frameworks[NIST].coverage, (1 + 1 + 0 + 0.5) / 4);
  assert.equal(r.summary.frameworks[SOC2].counts.na, 2);
});

test("gaps: Gap Identified plus any None; limited coverage and not scorable are separate checks", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES.slice(0, 5), T);
  ws = rateAndConfirm(ws, "C001", ["full", "full", "full", "full"]); // no gap
  ws = rateAndConfirm(ws, "C002", ["full", "none", "full", "full"]); // None, not Gap status
  ws = rateAndConfirm(ws, "C003", ["none", "partial", "none", "na"]); // Gap status with Nones
  ws = rateAndConfirm(ws, "C004", ["partial", "na", "na", "na"]); // check: limited coverage
  ws = rateAndConfirm(ws, "C005", ["na", "na", "na", "na"]); // check: not scorable
  const r = buildResults(ws);
  assert.deepEqual(
    r.gaps.map((g) => [g.id, g.gapStatus, g.noneFrameworks.map((n) => n.framework)]),
    [
      ["C002", false, [ISO]],
      ["C003", true, [NIST, CIS]],
    ],
  );
  assert.equal(r.gaps[0].noneFrameworks[0].rationale, "Why none");
  assert.deepEqual(r.gaps[0].noneFrameworks[0].ids, ["A.8.5"]);
  assert.deepEqual(
    r.checks.map((c) => [c.id, c.kind, c.naFrameworks.length]),
    [
      ["C004", "limited-coverage", 3],
      ["C005", "not-scorable", 4],
    ],
  );
  assert.equal(r.summary.notScorable.length, 1);
});

test("results: works with a single confirmed control", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES.slice(0, 1), T);
  ws = rateAndConfirm(ws, "C001", ["full", "partial", "na", "partial"]);
  const r = buildResults(ws);
  assert.equal(r.rows.length, 1);
  assert.equal(r.awaitingReview, 0);
  assert.ok(Math.abs((r.rows[0].score ?? 0) - 2 / 3) < 1e-12);
  const lines = matrixCsv(r.rows).split("\r\n");
  assert.equal(lines.length, 3); // header, one row, trailing newline
});

test("csv: formula-injection cells are neutralized with a leading apostrophe", () => {
  assert.equal(csvCell("=1+1"), `"'=1+1"`);
  assert.equal(csvCell("+cmd|' /C calc'!A0"), `"'+cmd|' /C calc'!A0"`);
  assert.equal(csvCell("-2+3"), `"'-2+3"`);
  assert.equal(csvCell("@SUM(A1:A2)"), `"'@SUM(A1:A2)"`);
  assert.equal(csvCell("\t=1"), `"'\t=1"`);
  assert.equal(csvCell("\r=1"), `"'\r=1"`);
  assert.equal(csvCell('  =HYPERLINK("http://example.com","click")'), `"'  =HYPERLINK(""http://example.com"",""click"")"`);
  // Ordinary values are untouched apart from quoting.
  assert.equal(csvCell("PR.AA-03; PR.AA-01"), `"PR.AA-03; PR.AA-01"`);
  assert.equal(csvCell("0.875"), `"0.875"`);
  assert.equal(csvCell("Covers a, b and c"), `"Covers a, b and c"`);
  assert.equal(csvCell('He said "yes"\nthen left'), `"He said ""yes""\nthen left"`);
  assert.equal(csvCell(""), `""`);
});

test("csv: header, confirmed rows only, injection-safe text from the analyst", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES.slice(0, 2), T);
  const added = addControl(ws, { name: '=HYPERLINK("http://example.com","click")', description: "@cmd, with comma\nand a new line" }, T);
  ws = added.ws;
  ws = rateAndConfirm(ws, added.id!, ["full", "none", "na", "partial"]);
  ws = rateAndConfirm(ws, "C001", ["full", "full", "full", "full"]);
  const csv = matrixCsv(buildResults(ws).rows);
  assert.ok(csv.startsWith("﻿"));
  const body = csv.slice(1);
  assert.ok(body.startsWith(CSV_HEADERS.map((h) => `"${h}"`).join(",")));
  assert.ok(!body.includes("C002")); // not confirmed, not exported
  assert.ok(body.includes(`"'=HYPERLINK(""http://example.com"",""click"")"`));
  assert.ok(body.includes(`"'@cmd, with comma\nand a new line"`));
  // The analyst's control as one exact row: IDs, ratings, rationales, score 0.5, status, flag, date.
  const row = body.split("\r\n").find((l) => l.startsWith(`"${added.id}"`));
  assert.equal(
    row,
    [
      added.id,
      `'=HYPERLINK(""http://example.com"",""click"")`,
      "'@cmd, with comma\nand a new line",
      "",
      "",
      "",
      "PR.AA-03",
      "A.8.5",
      "N/A",
      "CC6.1",
      "Full",
      "Why full",
      "None",
      "Why none",
      "N/A",
      "Nothing on this topic",
      "Partial",
      "Why partial",
      "0.5",
      "Partially Aligned",
      "No",
      "2026-10-10 14:05",
    ]
      .map((c) => `"${c}"`)
      .join(","),
  );
});

test("csv: columns follow the v1 matrix, then ratings, rationales, score, status, flag and date", () => {
  assert.deepEqual(CSV_HEADERS.slice(0, 10), [
    "Control ID",
    "Control Name",
    "Description",
    "Control Objective",
    "Control Activity",
    "Control Owner",
    "NIST CSF 2.0",
    "ISO/IEC 27001:2022",
    "CIS Controls v8.1",
    "SOC 2 TSC",
  ]);
  assert.deepEqual(CSV_HEADERS.slice(-4), ["Score", "Status", "Limited framework coverage", "Confirmed at (UTC)"]);
  assert.ok(!CSV_HEADERS.some((h) => /model|AI/i.test(h))); // AI source and model are left out
  assert.equal(csvFileName(new Date(2026, 9, 10, 9, 0)), "puc-control-matrix-2026-10-10.csv");
});
