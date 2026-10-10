import type { Catalog } from "../catalog/types.ts";
import { OUTPUT_KEYS, type ControlInput, type OutputKey, type RawProposal } from "./types.ts";

const STOPWORDS = new Set(
  "a an and are as at be by for from in into is it of on or per that the their this to with without using use via all any its our".split(" "),
);

const tokens = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
      .map((t) => t.replace(/(ies|es|s)$/, "")),
  );

// ID-like strings typed into the control text (e.g. "ISO A.9.2.1", "CIS 18.6") are echoed back as
// suggestions, the way a model sometimes repeats outdated IDs, so the removal guardrail can be seen.
const ECHO_PATTERNS: Record<OutputKey, RegExp> = {
  nist: /\b(?:GV|ID|PR|DE|RS|RC)\.[A-Z]{2}-\d{1,2}\b/g,
  iso: /\bA\.\d{1,2}(?:\.\d{1,2}){1,2}\b/g,
  cis: /\bCIS\s+(\d{1,2}\.\d{1,2})\b/gi,
  soc2: /\b(?:CC\d|A1|C1|PI1|P\d)\.\d{1,2}\b/g,
};

/**
 * Deterministic stand-in for the model, used until an API key is configured (MAPPER=mock).
 * It scores catalog labels by word overlap with the control text. It is NOT an AI judgment
 * and says so in every rationale.
 */
export function mockMap(control: ControlInput, catalogs: readonly Catalog[]): RawProposal {
  const text = [control.name, control.description, control.objective, control.activity].filter(Boolean).join(" ");
  const words = tokens(text);
  const frameworks = {} as RawProposal["frameworks"];

  for (const key of Object.keys(OUTPUT_KEYS) as OutputKey[]) {
    const catalog = catalogs.find((c) => c.framework === OUTPUT_KEYS[key]);
    if (!catalog) throw new Error(`Missing catalog ${OUTPUT_KEYS[key]}`);
    const scored = catalog.items
      .map((item) => {
        const hits = [...tokens(item.label)].filter((t) => words.has(t));
        return { id: item.id, hits, score: hits.length };
      })
      .filter((s) => s.score >= 2)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, "en", { numeric: true }))
      .slice(0, 3);

    const echoed = [...text.matchAll(ECHO_PATTERNS[key])].map((m) => m[1] ?? m[0]);
    const ids = [...new Set([...scored.map((s) => s.id), ...echoed])];
    const matched = [...new Set(scored.flatMap((s) => s.hits))].slice(0, 6);

    frameworks[key] =
      ids.length === 0
        ? { ids: [], rating: "none", rationale: "Mock mapper (keyword overlap, not AI): no catalog label shared two or more words with the control text.", na_reason: null }
        : {
            ids,
            rating: scored.length > 0 && scored[0].score >= 3 ? "partial" : "none",
            rationale: `Mock mapper (keyword overlap, not AI): matched ${matched.length ? matched.map((w) => `"${w}"`).join(", ") : "ID-like text in the input"}.`,
            na_reason: null,
          };
  }

  return {
    frameworks,
    uncertainties: ["This is mock output based on word overlap, not an AI or analyst judgment."],
    missing_information: [],
  };
}
