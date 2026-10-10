// Prints the draft 14x4 ratings table and the v1 back-test as Markdown. Run: npm run backtest
import { readFileSync } from "node:fs";
import { backtestV1, type DraftRatings } from "../lib/backtest.ts";
import { FRAMEWORK_IDS } from "../lib/catalog/types.ts";
import { RATING_LABELS } from "../lib/scoring/config.ts";
import { formatScore } from "../lib/scoring/score.ts";

const v1 = JSON.parse(readFileSync("data/v1-controls.json", "utf8"));
const ratings: DraftRatings = JSON.parse(readFileSync("data/v1-ratings.draft.json", "utf8"));

const HEAD = { "nist-csf-2.0": "NIST CSF 2.0", "iso-27001-2022": "ISO 27001", "cis-v8.1": "CIS v8.1", "soc2-tsc-2017": "SOC 2" };

console.log("## Draft ratings (draft, pending Bernadette)\n");
console.log(`| Control | ${FRAMEWORK_IDS.map((f) => HEAD[f]).join(" | ")} |`);
console.log(`|---|${FRAMEWORK_IDS.map(() => "---").join("|")}|`);
for (const c of v1.controls) {
  const cells = FRAMEWORK_IDS.map((f) => {
    const r = ratings.controls[c.id][f];
    return r.rating === "na" ? `N/A (${r.naReason})` : RATING_LABELS[r.rating];
  });
  console.log(`| ${c.id} ${c.name} | ${cells.join(" | ")} |`);
}

const rows = backtestV1(v1.controls, ratings);
console.log("\n## Back-test: scoring rule vs v1 labels\n");
console.log("| Control | v1 label | Rule result | Score | Match |");
console.log("|---|---|---|---|---|");
for (const r of rows) {
  console.log(`| ${r.id} ${r.name} | ${r.v1Status} | ${r.ruleStatus} | ${formatScore(r.score)} | ${r.agrees ? "yes" : "**differs**"} |`);
}
const differ = rows.filter((r) => !r.agrees);
console.log(`\n${rows.length - differ.length} of ${rows.length} match; ${differ.length} differ.\n`);
for (const r of differ) console.log(`- ${r.id}: ${r.explanation}`);
