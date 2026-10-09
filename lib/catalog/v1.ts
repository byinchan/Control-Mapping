import { normalizeId } from "./ids.ts";
import type { FrameworkId } from "./types.ts";

export type V1Cell = { kind: "ids"; ids: string[] } | { kind: "na"; reason: string };

const NA_PREFIX = /^N\/A\b/i;
const CIS_RANGE = /^(\d{1,2})\.(\d{1,2})\s*[-‐-―]\s*(\d{1,2})\.(\d{1,2})$/;

/**
 * Parses one framework cell of the v1 matrix, e.g. "7.3 -7.6", "CC1.4, CC5.3, "
 * or "N/A  (Outside CIS Scope)". CIS ranges are expanded only within one control.
 * Validity against the catalog is checked separately.
 */
export function parseV1Cell(framework: FrameworkId, cell: string): V1Cell {
  const text = cell.trim();
  if (NA_PREFIX.test(text)) {
    const reason = text
      .replace(NA_PREFIX, "")
      .replace(/^[\s\-‐-―:]+/, "")
      .replace(/^\((.*)\)$/, "$1")
      .trim();
    if (!reason) throw new Error(`N/A without a reason: "${cell}"`);
    return { kind: "na", reason };
  }
  const ids: string[] = [];
  for (const token of text.split(",").map((t) => t.trim()).filter(Boolean)) {
    const range = framework === "cis-v8.1" ? CIS_RANGE.exec(token) : null;
    if (range) {
      const [, c1, s1, c2, s2] = range.map(Number);
      if (c1 !== c2 || s2 <= s1) throw new Error(`Invalid CIS range: "${token}"`);
      for (let s = s1; s <= s2; s++) ids.push(`${c1}.${s}`);
    } else {
      ids.push(normalizeId(framework, token));
    }
  }
  if (ids.length === 0) throw new Error(`Empty cell for ${framework}`);
  return { kind: "ids", ids };
}
