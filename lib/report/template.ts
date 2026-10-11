// "Template draft, not AI": a plain narrative built by code from the facts pack only.
// It is the fallback when no AI draft is available, and it must pass the same checks as any narrative.
import { THRESHOLDS } from "../scoring/config.ts";
import type { Facts } from "./facts.ts";
import type { SectionKey } from "./report.ts";

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
const bullets = (lines: string[]) => lines.map((l) => `- ${l}`).join("\n");
const ref = (c: { id: string; name: string }) => `${c.id} ${c.name}`;

export function templateSections(f: Facts): Record<SectionKey, string> {
  const n = f.confirmed;
  const s = f.statusCounts;
  const rated = f.coverage.filter((c) => c.average !== "n/a");
  const byAverage = [...rated].sort((a, b) => Number(b.average) - Number(a.average));
  const best = byAverage[0];
  const worst = byAverage.at(-1);
  const fully = f.controls.filter((c) => c.status === "Fully Aligned");
  const limited = f.controls.filter((c) => c.limitedCoverage);
  const notMet = f.gaps.filter((g) => g.notMet.length > 0);

  const purpose =
    `This report summarizes how ${n} security control${n === 1 ? "" : "s"} of ${f.organisation}, a fictional organization, ` +
    `align to ${f.frameworks.length === 4 ? "four" : f.frameworks.length} frameworks: ${list(f.frameworks)}. ` +
    "Only controls the analyst has confirmed are included.";

  const keyMessages = bullets([
    n === 1
      ? `The single confirmed control has status ${f.controls[0].status}.`
      : `${s["Fully Aligned"]} of ${n} confirmed controls ${s["Fully Aligned"] === 1 ? "is" : "are"} Fully Aligned, ${s["Partially Aligned"]} ${s["Partially Aligned"] === 1 ? "is" : "are"} Partially Aligned and ${s["Gap Identified"]} ${s["Gap Identified"] === 1 ? "has" : "have"} status Gap Identified.`,
    best && worst && best.name !== worst.name
      ? `Average rating by framework ranges from ${worst.average} (${worst.name}) to ${best.average} (${best.name}).`
      : best
        ? `Average rating for ${best.name} is ${best.average}.`
        : "No framework could be rated.",
    notMet.length > 0
      ? `Requirements not met (rated None) appear for ${list(notMet.map(ref))}.`
      : "No framework is rated None for any confirmed control.",
    ...(f.awaitingReview > 0
      ? [`${f.awaitingReview} ${f.awaitingReview === 1 ? "control awaiting review is" : "controls awaiting review are"} not included.`]
      : []),
  ]);

  const top = [...f.controls].filter((c) => c.score !== "n/a").sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 3);
  const strengths =
    fully.length > 0
      ? `Fully Aligned: ${list(fully.map(ref))}.` + (best ? ` The highest average rating is for ${best.name} (${best.average}).` : "")
      : top.length > 0
        ? `No control is Fully Aligned. The highest scores are ${list(top.map((c) => `${ref(c)} (${c.score})`))}.`
        : "No confirmed control could be scored.";

  const gapLines = f.gaps.map((g) =>
    g.notMet.length > 0
      ? `${ref(g)}${g.owner ? ` (${g.owner})` : ""}: ${list(g.notMet)} has a requirement this control, as described, doesn't meet. Status ${g.status}, score ${g.score}.`
      : `${ref(g)}${g.owner ? ` (${g.owner})` : ""}: low overall score ${g.score}, status ${g.status}.`,
  );
  const limitedLines = limited.map((c) => `${ref(c)}: rated against a single framework, so its result rests on that framework alone.`);
  const gapsAndRisks =
    gapLines.length + limitedLines.length === 0
      ? "No gaps or requirements not met among the confirmed controls."
      : bullets([...gapLines, ...limitedLines]);

  const recs: string[] = notMet.slice(0, 4).map(
    (g) => `Review ${ref(g)} with ${g.owner ?? "the control owner"} against ${list(g.notMet)}, and decide whether to strengthen the control or record the gap.`,
  );
  if (limited.length > 0) recs.push(`Confirm the framework scope of ${list(limited.map(ref))}, which ${limited.length === 1 ? "is" : "are"} rated against a single framework.`);
  if (f.awaitingReview > 0) recs.push("Finish reviewing the controls awaiting review so the results cover the full set.");
  const lowest = f.controls
    .filter((c) => c.status === "Partially Aligned" && c.score !== "n/a")
    .sort((a, b) => Number(a.score) - Number(b.score))
    .slice(0, 2);
  // Fill to at least 3 recommendations, most specific first.
  const fillers = [
    ...(lowest.length > 0
      ? [`Start improvement work with the lowest-scored Partially Aligned controls: ${list(lowest.map((c) => `${ref(c)} (${c.score})`))}.`]
      : []),
    "Keep the mappings under periodic review as controls and frameworks change.",
    "Collect evidence for the confirmed controls before any assurance work, since this report covers alignment only.",
  ];
  for (const r of fillers) if (recs.length < 5) recs.push(r);
  const recommendations = bullets(recs.slice(0, 5));

  const method =
    "Controls were loaded from the Version 1 PUC matrix or entered by the analyst. An AI model suggested requirement IDs, ratings and rationales " +
    "from the reference catalogs, and the analyst reviewed, edited and confirmed every mapping. Code calculated every figure in this report: " +
    `Full scores 1, Partial 0.5 and None 0, and N/A is left out. A control is Fully Aligned at ${THRESHOLDS.fullyAlignedMin} or higher with no None, ` +
    `Gap Identified below ${THRESHOLDS.gapBelow} (or below ${THRESHOLDS.gapWithNoneBelow} with a None), and Partially Aligned otherwise. ` +
    "Limitations: this report shows how controls, as described, align to frameworks. It does not show that they are implemented or effective. " +
    `Results cover the ${n} confirmed control${n === 1 ? "" : "s"} only, and the organization is fictional.`;

  return { purpose, keyMessages, strengths, gapsAndRisks, recommendations, method };
}
