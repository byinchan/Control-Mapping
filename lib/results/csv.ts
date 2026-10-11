// CSV export of the confirmed matrix. Built in the browser; nothing is sent to a server.
import { FRAMEWORK_NAMES } from "../catalog/names.ts";
import { FRAMEWORK_IDS, type FrameworkId } from "../catalog/types.ts";
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

// In the CSV only, CIS safeguard IDs are written as "CIS 3.10". A bare "3.10" looks like a number to a
// spreadsheet and silently becomes 3.1 (a different, existing safeguard), or a date in some locales.
// A value starting with letters always stays text. The app and stored data keep plain IDs.
const exportIds = (f: FrameworkId, ids: readonly string[]) => (f === "cis-v8.1" ? ids.map((id) => `CIS ${id}`) : [...ids]).join("; ");

const idsHeader = (f: FrameworkId) => (f === "cis-v8.1" ? `${FRAMEWORK_NAMES[f]} safeguards` : FRAMEWORK_NAMES[f]);

export const CSV_HEADERS = [
  "Control ID",
  "Control Name",
  "Control Owner",
  "Score",
  "Status",
  "Limited framework coverage",
  ...FRAMEWORK_IDS.flatMap((f) => [idsHeader(f), `${FRAMEWORK_NAMES[f]} rating`]),
  ...FRAMEWORK_IDS.map((f) => `${FRAMEWORK_NAMES[f]} rationale or N/A reason`),
  "Confirmed at (UTC)",
  // Not in the requested order; kept so the control text is not lost from the export.
  "Description",
  "Control Objective",
];

function rowCells(row: MatrixRow): string[] {
  const c = row.control;
  return [
    row.id,
    c.name,
    c.owner ?? "",
    formatScore(row.score),
    row.status,
    row.limitedCoverage ? "Yes" : "No",
    ...FRAMEWORK_IDS.flatMap((f) => {
      const cell = row.cells[f];
      return [cell.rating === "na" ? RATING_LABELS.na : exportIds(f, cell.ids), RATING_LABELS[cell.rating]];
    }),
    ...FRAMEWORK_IDS.map((f) => (row.cells[f].rating === "na" ? row.cells[f].naReason : row.cells[f].rationale)),
    row.confirmedAt.slice(0, 16).replace("T", " "),
    c.description,
    c.objective ?? "",
  ];
}

/** CSV text (UTF-8 with BOM so Excel reads accents correctly, CRLF line ends) of confirmed rows only. */
export function matrixCsv(rows: readonly MatrixRow[]): string {
  const lines = [CSV_HEADERS, ...rows.map(rowCells)].map((cells) => cells.map(csvCell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** File name with the local date, e.g. puc-control-matrix-2026-10-10.csv */
export function csvFileName(now: Date): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `puc-control-matrix-${d}.csv`;
}
