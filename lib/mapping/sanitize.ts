import type { IdIndex } from "../catalog/ids.ts";
import { validateIds } from "../catalog/ids.ts";
import { FRAMEWORK_NAMES } from "../catalog/names.ts";
import type { FrameworkId } from "../catalog/types.ts";
import { RATING_LABELS } from "../scoring/config.ts";
import { OUTPUT_LIMITS } from "./config.ts";
import { OUTPUT_KEYS, type FrameworkProposal, type Guardrails, type OutputKey, type Proposal, type RawProposal } from "./types.ts";

function cap(text: string, max: number, field: string, truncated: string[]): string {
  const t = text.trim();
  if (t.length <= max) return t;
  truncated.push(field);
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Turns raw model output into an advisory proposal: removes every ID that is not in the
 * reference catalogs, caps text, and records each change so the analyst can see it.
 * Nothing is silently filled in: problems become warnings, not invented values.
 */
export function sanitizeProposal(
  raw: RawProposal,
  index: IdIndex,
  truncatedInput: string[] = [],
): { proposal: Proposal; guardrails: Guardrails } {
  const guardrails: Guardrails = { droppedIds: [], truncatedInput: [...truncatedInput], truncatedOutput: [], warnings: [] };
  const frameworks = {} as Record<FrameworkId, FrameworkProposal>;

  for (const key of Object.keys(OUTPUT_KEYS) as OutputKey[]) {
    const framework = OUTPUT_KEYS[key];
    const name = FRAMEWORK_NAMES[framework];
    const f = raw.frameworks[key];
    const { valid, dropped } = validateIds(index, framework, f.ids);
    for (const id of dropped) guardrails.droppedIds.push({ framework, id: id.slice(0, 40) });

    let ids = valid;
    if (ids.length > OUTPUT_LIMITS.idsPerFramework) {
      guardrails.warnings.push(`${name}: the AI listed ${ids.length} requirements. Only the first ${OUTPUT_LIMITS.idsPerFramework} were kept.`);
      ids = ids.slice(0, OUTPUT_LIMITS.idsPerFramework);
    }

    let naReason = f.na_reason?.trim() ? cap(f.na_reason, OUTPUT_LIMITS.naReason, `${framework}.naReason`, guardrails.truncatedOutput) : null;
    if (f.rating === "na") {
      if (!naReason) {
        guardrails.warnings.push(`${name}: the AI said this framework has no requirement on this topic but gave no reason. Add a reason, or change the rating.`);
      }
      if (ids.length > 0) {
        guardrails.warnings.push(
          `${name}: the AI said this framework has no requirement on this topic, but it also listed requirements from it. Decide which is right: remove the IDs, or change the rating.`,
        );
      }
    } else {
      naReason = null;
      if (ids.length === 0) {
        guardrails.warnings.push(
          `${name}: the AI rated this "${RATING_LABELS[f.rating]}" but listed no requirement from the catalog. Add the requirement IDs, or change the rating.`,
        );
      }
    }

    frameworks[framework] = {
      ids,
      rating: f.rating,
      rationale: cap(f.rationale, OUTPUT_LIMITS.rationale, `${framework}.rationale`, guardrails.truncatedOutput),
      naReason,
    };
  }

  const list = (items: string[], field: string) => {
    if (items.length > OUTPUT_LIMITS.listItems) guardrails.truncatedOutput.push(field);
    return items
      .slice(0, OUTPUT_LIMITS.listItems)
      .map((s, i) => cap(s, OUTPUT_LIMITS.listItemLength, `${field}[${i}]`, guardrails.truncatedOutput))
      .filter(Boolean);
  };

  return {
    proposal: {
      frameworks,
      uncertainties: list(raw.uncertainties, "uncertainties"),
      missingInformation: list(raw.missing_information, "missingInformation"),
    },
    guardrails,
  };
}

/** One-line summary of removed IDs for the UI, e.g. "2 suggested IDs were not in the catalog and were removed." */
export function droppedIdsNotice(g: Guardrails): string | null {
  const n = g.droppedIds.length;
  if (n === 0) return null;
  return `${n} suggested ID${n === 1 ? " was" : "s were"} not in the catalog and ${n === 1 ? "was" : "were"} removed: ${g.droppedIds
    .map((d) => d.id)
    .join(", ")}.`;
}
