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
  // The analyst's control as one exact row, in the new column order.
  const row = body.split("\r\n").find((l) => l.startsWith(`"${added.id}"`));
  assert.equal(
    row,
    [
      added.id,
      `'=HYPERLINK(""http://example.com"",""click"")`,
      "",
      "0.50",
      "Partially Aligned",
      "No",
      "PR.AA-03",
      "Full",
      "A.8.5",
      "None",
      "N/A",
      "N/A",
      "CC6.1",
      "Partial",
      "Why full",
      "Why none",
      "Nothing on this topic",
      "Why partial",
      "2026-10-10 14:05",
      "'@cmd, with comma\nand a new line",
      "",
    ]
      .map((c) => `"${c}"`)
      .join(","),
  );
});

test("csv: columns in the requested order; no Activity, AI source or model columns", () => {
  assert.deepEqual(CSV_HEADERS, [
    "Control ID",
    "Control Name",
    "Control Owner",
    "Score",
    "Status",
    "Limited framework coverage",
    "NIST CSF 2.0",
    "NIST CSF 2.0 rating",
    "ISO/IEC 27001:2022",
    "ISO/IEC 27001:2022 rating",
    "CIS Controls v8.1 safeguards",
    "CIS Controls v8.1 rating",
    "SOC 2 TSC",
    "SOC 2 TSC rating",
    "NIST CSF 2.0 rationale or N/A reason",
    "ISO/IEC 27001:2022 rationale or N/A reason",
    "CIS Controls v8.1 rationale or N/A reason",
    "SOC 2 TSC rationale or N/A reason",
    "Confirmed at (UTC)",
    "Description",
    "Control Objective",
  ]);
  assert.ok(!CSV_HEADERS.some((h) => /activity|model|\bAI\b/i.test(h)));
  assert.equal(csvFileName(new Date(2026, 9, 10, 9, 0)), "puc-control-matrix-2026-10-10.csv");
});


/** Parses the CSV produced by matrixCsv (every cell quoted) into rows of cells. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = text.startsWith("\uFEFF") ? 1 : 0;
  while (i < text.length) {
    assert.equal(text[i], '"', `cell must be quoted at ${i}`);
    let j = i + 1;
    let cell = "";
    for (;;) {
      if (text[j] === '"' && text[j + 1] === '"') {
        cell += '"';
        j += 2;
      } else if (text[j] === '"') break;
      else cell += text[j++];
    }
    row.push(cell);
    i = j + 1;
    if (text[i] === ",") i += 1;
    else if (text.startsWith("\r\n", i)) {
      rows.push(row);
      row = [];
      i += 2;
    }
  }
  return rows;
}

const CIS_COL = CSV_HEADERS.indexOf("CIS Controls v8.1 safeguards");

test("csv: the five CIS IDs that a spreadsheet would turn into another safeguard stay exact as text", () => {
  for (const id of ["3.10", "4.10", "8.10", "13.10", "16.10"]) {
    let ws = loadSample(emptyWorkspace(), PUC_SAMPLES.slice(0, 1), T);
    ws = rateAndConfirm(ws, "C001", ["full", "full", "full", "full"]);
    ws = reopenControl(ws, "C001", T);
    ws = editFramework(ws, "C001", CIS, { ids: [id] }, T);
    ws = confirmControl(ws, "C001", ID_INDEX, T).ws;
    const [, data] = parseCsv(matrixCsv(buildResults(ws).rows));
    assert.equal(data[CIS_COL], `CIS ${id}`, id);
    assert.ok(Number.isNaN(Number(data[CIS_COL])), `${id} must not look like a number`);
  }
});

test("csv: single and multiple CIS IDs get the prefix; other frameworks and the app keep plain IDs", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES.slice(0, 2), T);
  ws = rateAndConfirm(ws, "C001", ["full", "full", "full", "full"]);
  ws = rateAndConfirm(ws, "C002", ["full", "full", "full", "full"]);
  ws = reopenControl(ws, "C002", T);
  ws = editFramework(ws, "C002", CIS, { ids: ["6.3", "6.4", "13.10"] }, T);
  ws = confirmControl(ws, "C002", ID_INDEX, T).ws;
  const results = buildResults(ws);
  const [, c001, c002] = parseCsv(matrixCsv(results.rows));
  assert.equal(c001[CIS_COL], "CIS 6.3");
  assert.equal(c002[CIS_COL], "CIS 6.3; CIS 6.4; CIS 13.10");
  assert.equal(c001[CSV_HEADERS.indexOf("NIST CSF 2.0")], "PR.AA-03");
  assert.equal(c001[CSV_HEADERS.indexOf("ISO/IEC 27001:2022")], "A.8.5");
  assert.equal(c001[CSV_HEADERS.indexOf("SOC 2 TSC")], "CC6.1");
  // Stored and displayed IDs stay plain.
  assert.deepEqual(results.rows[1].cells[CIS].ids, ["6.3", "6.4", "13.10"]);
});

test("csv: the formula guard applies to every cell of a full export", () => {
  let ws = emptyWorkspace();
  const risky = ["=1+1", "+cmd", "-2", "@SUM(A1)", "\t=1", "\r=1", "  =HYPERLINK(\"x\")"];
  for (const [i, text] of risky.entries()) {
    const r = addControl(ws, { name: text, description: text, objective: text, owner: text }, T);
    ws = r.ws;
    FRAMEWORK_IDS.forEach((f) => {
      ws = editFramework(ws, r.id!, f, { rating: i % 2 ? "na" : "none", ids: i % 2 ? [] : [IDS[f]], naReason: text, rationale: text }, T);
    });
    ws = confirmControl(ws, r.id!, ID_INDEX, T).ws;
  }
  const rows = parseCsv(matrixCsv(buildResults(ws).rows));
  assert.equal(rows.length, risky.length + 1);
  let checked = 0;
  for (const row of rows.slice(1)) {
    assert.equal(row.length, CSV_HEADERS.length);
    for (const cell of row) {
      assert.doesNotMatch(cell, /^\s*[=+\-@\t\r]/, `unguarded cell: ${JSON.stringify(cell)}`);
      checked += 1;
    }
  }
  assert.equal(checked, risky.length * CSV_HEADERS.length);
});
