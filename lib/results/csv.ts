// CSV export of the confirmed matrix. Built in the browser; nothing is sent to a server.
import { FRAMEWORK_NAMES } from "../catalog/names.ts";
import { FRAMEWORK_IDS } from "../catalog/types.ts";
import { RATING_LABELS } from "../scoring/config.ts";
import { formatScore } from "../scoring/score.ts";
import type { MatrixRow } from "./matrix.ts";

// A cell starting with one of these (after any spaces) can run as a formula in Excel, Sheets or
// Numbers. Such cells get a leading apostrophe so the spreadsheet shows them as text.
const FORMULA_START = /^[\s]*[=+\-@\t\r]/;

/** Neutralizes formula injection, then quotes the cell (every cell is quoted). */
export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const CSV_HEADERS = [
  "Control ID",
  "Control Name",
  "Description",
  "Control Objective",
  "Control Activity",
  "Control Owner",
  ...FRAMEWORK_IDS.map((f) => FRAMEWORK_NAMES[f]),
  ...FRAMEWORK_IDS.flatMap((f) => [`${FRAMEWORK_NAMES[f]} rating`, `${FRAMEWORK_NAMES[f]} rationale or N/A reason`]),
  "Score",
  "Status",
  "Limited framework coverage",
  "Confirmed at (UTC)",
];

function rowCells(row: MatrixRow): string[] {
  const c = row.control;
  return [
    row.id,
    c.name,
    c.description,
    c.objective ?? "",
    c.activity ?? "",
    c.owner ?? "",
    ...FRAMEWORK_IDS.map((f) => (row.cells[f].rating === "na" ? RATING_LABELS.na : row.cells[f].ids.join("; "))),
    ...FRAMEWORK_IDS.flatMap((f) => {
      const cell = row.cells[f];
      return [RATING_LABELS[cell.rating], cell.rating === "na" ? cell.naReason : cell.rationale];
    }),
    formatScore(row.score),
    row.status,
    row.limitedCoverage ? "Yes" : "No",
    row.confirmedAt.slice(0, 16).replace("T", " "),
  ];
}

/** CSV text (UTF-8 with BOM so Excel reads accents correctly, CRLF line ends) of confirmed rows only. */
export function matrixCsv(rows: readonly MatrixRow[]): string {
  const lines = [CSV_HEADERS, ...rows.map(rowCells)].map((cells) => cells.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** File name with the local date, e.g. puc-control-matrix-2026-10-10.csv */
export function csvFileName(now: Date): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `puc-control-matrix-${d}.csv`;
}
