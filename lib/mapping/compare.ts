import { FRAMEWORK_IDS, type FrameworkId } from "../catalog/types.ts";

export type CellMapping = { kind: "ids"; ids: string[] } | { kind: "na" };

export type CellComparison = {
  framework: FrameworkId;
  /** exact: same IDs; overlap: some shared; disjoint: none shared; both-na; na-mismatch: one side N/A. */
  result: "exact" | "overlap" | "disjoint" | "both-na" | "na-mismatch";
  shared: string[];
  aiOnly: string[];
  analystOnly: string[];
};

/** Compares AI-suggested IDs with the analyst's IDs for one control and framework. Pure, no scoring. */
export function compareCell(framework: FrameworkId, ai: CellMapping, analyst: CellMapping): CellComparison {
  if (ai.kind === "na" || analyst.kind === "na") {
    const aiIds = ai.kind === "ids" ? ai.ids : [];
    const analystIds = analyst.kind === "ids" ? analyst.ids : [];
    return {
      framework,
      result: ai.kind === "na" && analyst.kind === "na" ? "both-na" : "na-mismatch",
      shared: [],
      aiOnly: aiIds,
      analystOnly: analystIds,
    };
  }
  const a = new Set(ai.ids);
  const b = new Set(analyst.ids);
  const shared = ai.ids.filter((id) => b.has(id));
  const aiOnly = ai.ids.filter((id) => !b.has(id));
  const analystOnly = analyst.ids.filter((id) => !a.has(id));
  const result = aiOnly.length === 0 && analystOnly.length === 0 ? "exact" : shared.length > 0 ? "overlap" : "disjoint";
  return { framework, result, shared, aiOnly, analystOnly };
}

export function summarizeComparisons(cells: readonly CellComparison[]) {
  const counts = { exact: 0, overlap: 0, disjoint: 0, "both-na": 0, "na-mismatch": 0 };
  const byFramework = Object.fromEntries(FRAMEWORK_IDS.map((f) => [f, { ...counts }])) as Record<FrameworkId, typeof counts>;
  for (const c of cells) {
    counts[c.result] += 1;
    byFramework[c.framework][c.result] += 1;
  }
  return { counts, byFramework };
}
