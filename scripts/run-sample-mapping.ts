// Runs the configured mapper over the 14 PUC sample controls, compares the suggested IDs with the
// analyst's sample mappings and (with --write-demo) saves the outputs as data/demo-mappings.json.
//   npm run mapping:samples                 # mock mapper (MAPPER=mock) or live if a key is set
//   npm run mapping:samples -- --write-demo # also write the demo file
// Live runs spend API credit (about 14 Haiku calls).
import { readFileSync, writeFileSync } from "node:fs";
import corrections from "../data/sample-corrections.json" with { type: "json" };
import v1 from "../data/v1-controls.json" with { type: "json" };
import { CATALOGS, ID_INDEX } from "../lib/catalog/catalogs.ts";
import { FRAMEWORK_IDS } from "../lib/catalog/types.ts";
import { createLiveMapper, type Usage } from "../lib/mapping/anthropic.ts";
import { compareCell, summarizeComparisons, type CellComparison } from "../lib/mapping/compare.ts";
import { readSettings } from "../lib/mapping/config.ts";
import type { DemoFile } from "../lib/mapping/demo.ts";
import { mockMap } from "../lib/mapping/mock.ts";
import { buildSystemPrompt } from "../lib/mapping/prompt.ts";
import { sanitizeProposal } from "../lib/mapping/sanitize.ts";
import { parseRawProposal } from "../lib/mapping/schema.ts";
import { applySampleCorrections, sampleIntake, type SampleCorrection, type V1Control } from "../lib/sample.ts";

// Claude Haiku 5.5 list prices per million tokens (prompts up to 100K tokens), from Anthropic's
// pricing table as checked on 2026-10-09. Used only for this script's cost estimate.
const PRICES: Record<string, { input: number; output: number }> = { "claude-haiku-5-5": { input: 0.1, output: 0.5 } };

const writeDemo = process.argv.includes("--write-demo");
const settings = readSettings(process.env);
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const live = settings.mapper === "live" && apiKey;
if (settings.mapper === "live" && !apiKey) {
  console.error("No ANTHROPIC_API_KEY found. Set MAPPER=mock to use the mock mapper.");
  process.exit(1);
}
const liveMapper = live ? createLiveMapper(apiKey, settings.model, buildSystemPrompt(CATALOGS)) : null;
const sample = applySampleCorrections(v1.controls as V1Control[], corrections.corrections as SampleCorrection[]);

const demo: DemoFile = {
  generatedBy: {
    mapper: live ? "live" : "mock",
    model: live ? settings.model : null,
    generatedAt: new Date().toISOString().slice(0, 10),
    note: live
      ? "One offline run of the live mapper over the 14 PUC sample controls. AI-generated, not reviewed."
      : "Mock mapper output (keyword overlap, not AI). Placeholder until the live model run.",
  },
  controls: {},
};
const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
const cells: CellComparison[] = [];
let dropped = 0;
let failures = 0;

for (const control of sample) {
  const input = sampleIntake(control);
  let output: unknown;
  if (liveMapper) {
    const result = await liveMapper(input);
    if (!result.ok) {
      console.error(`${control.id}: live call failed (${result.kind})`);
      failures += 1;
      continue;
    }
    output = result.output;
    for (const k of Object.keys(usage) as (keyof Usage)[]) usage[k] += result.usage[k];
  } else {
    output = mockMap(input, CATALOGS);
  }
  const parsed = parseRawProposal(output);
  if (!parsed.ok) {
    console.error(`${control.id}: output failed validation (${parsed.error})`);
    failures += 1;
    continue;
  }
  demo.controls[control.id] = { input, output };
  const { proposal, guardrails } = sanitizeProposal(parsed.proposal, ID_INDEX);
  dropped += guardrails.droppedIds.length;
  for (const f of FRAMEWORK_IDS) {
    const ai = proposal.frameworks[f];
    const analyst = control.frameworks[f];
    cells.push(
      compareCell(
        f,
        ai.rating === "na" ? { kind: "na" } : { kind: "ids", ids: ai.ids },
        analyst.kind === "na" ? { kind: "na" } : { kind: "ids", ids: analyst.ids },
      ),
    );
  }
}

console.log(`Mapper: ${live ? `live (${settings.model})` : "mock"}; controls mapped: ${Object.keys(demo.controls).length}/14; failures: ${failures}`);
console.log(`Suggested IDs removed by catalog validation: ${dropped}`);
const { counts, byFramework } = summarizeComparisons(cells);
console.log("Comparison with the analyst's sample mappings (cells):", counts);
for (const f of FRAMEWORK_IDS) console.log(`  ${f}:`, byFramework[f]);
if (live) {
  const p = PRICES[settings.model];
  const cost = p
    ? ((usage.inputTokens + usage.cacheWriteTokens * 1.25 + usage.cacheReadTokens * 0.1) * p.input + usage.outputTokens * p.output) / 1e6
    : null;
  console.log("Usage:", usage, cost === null ? "(no price on file for this model)" : `~$${cost.toFixed(4)}`);
}

if (writeDemo) {
  if (failures > 0) {
    console.error("Not writing the demo file because some controls failed.");
    process.exit(1);
  }
  const path = "data/demo-mappings.json";
  const previous = (() => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  })();
  writeFileSync(path, JSON.stringify(demo, null, 2) + "\n");
  console.log(`${previous ? "Updated" : "Wrote"} ${path}`);
}
