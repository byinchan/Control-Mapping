// "Template draft, not AI": a plain narrative built by code from the facts pack only.
// It is the fallback when no AI draft is available, and it must pass the same checks as any narrative.
import { THRESHOLDS } from "../scoring/config.ts";
import { OWNER_TO_ASSIGN } from "./checks.ts";
import type { Facts } from "./facts.ts";
import type { Draft, Recommendation } from "./report.ts";

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
const bullets = (lines: string[]) => lines.map((l) => `- ${l}`).join("\n");
const ref = (c: { id: string; name: string }) => `${c.id} ${c.name}`;

/**
 * The overall posture line at the top of Key messages. Written by code, never by the AI, and not editable.
 * "Gaps" are the same controls as the gaps table: status Gap Identified, or any framework rated None.
 */
export function postureLine(f: Facts): string {
  const fully = f.statusCounts["Fully Aligned"];
  const g = f.gaps.length;
  const first = `${fully} of ${f.confirmed} confirmed control${f.confirmed === 1 ? "" : "s"} ${fully === 1 ? "is" : "are"} Fully Aligned`;
  const second =
    g === 0 ? "no confirmed control has a gap that needs a decision" : g === 1 ? "1 control has a gap that needs a decision" : `${g} controls have gaps that need a decision`;
  return `${first}; ${second}.`;
}

/** Fixed line under Purpose and scope. Written by code, never by the AI, and not editable. */
export const DOES_NOT_SHOW =
  "What this report does not show: financial exposure, trends over time, incident data or benchmarks. It reflects only the controls confirmed in this session.";

export function templateDraft(f: Facts): Draft {
  const n = f.confirmed;
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

  // The status counts are in the headline results just above, so key messages do not repeat them.
  const keyMessages = bullets([
    best && worst && best.name !== worst.name
      ? `Average rating by framework ranges from ${worst.average} (${worst.name}) to ${best.average} (${best.name}).`
      : best
        ? `Average rating for ${best.name} is ${best.average}.`
        : "No framework could be rated.",
    notMet.length > 0
      ? `Requirements not met (rated None) appear for ${list(notMet.map(ref))}.`
      : "No framework is rated None for any confirmed control.",
    ...(limited.length > 0 ? [`Results for ${list(limited.map(ref))} rest on a single framework, so treat ${limited.length === 1 ? "it" : "them"} with more caution.`] : []),
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

  // Decision requested: what leadership is asked to approve. No amounts, budgets or deadlines: the data has none.
  const g = f.gaps.length;
  const decisionRequested =
    g > 0
      ? "Leadership is asked to:\n" +
        bullets([
          `Assign or confirm an owner for ${g === 1 ? "the control with a gap" : `each of the ${g} controls with gaps`}: ${list(f.gaps.map((x) => `${ref(x)} (${x.owner ?? "owner to assign"})`))}.`,
          `Approve remediation planning for ${g === 1 ? "this control" : "these controls"}, or record a decision to accept each gap.`,
          ...(f.awaitingReview > 0 ? [`Ask for the ${f.awaitingReview} ${f.awaitingReview === 1 ? "control awaiting review" : "controls awaiting review"} to be completed.`] : []),
        ])
      : "No confirmed control has a gap that needs a decision. Leadership is asked to:\n" +
        bullets([
          "Note the results.",
          "Approve continued periodic review of the mappings.",
          ...(f.awaitingReview > 0 ? [`Ask for the ${f.awaitingReview} ${f.awaitingReview === 1 ? "control awaiting review" : "controls awaiting review"} to be completed.`] : []),
        ]);

  // Owners come from the facts pack only; anything else is "Control owner (to assign)".
  const ownerOf = (cs: { owner: string | null }[]) => {
    const owners = [...new Set(cs.map((c) => c.owner).filter((o): o is string => Boolean(o)))];
    return owners.length === 1 && cs.every((c) => c.owner) ? owners[0] : OWNER_TO_ASSIGN;
  };
  const recs: Recommendation[] = notMet.slice(0, 4).map((x) => ({
    text: `Review ${ref(x)} against ${list(x.notMet)}, and decide whether to strengthen the control or record the gap.`,
    owner: x.owner ?? OWNER_TO_ASSIGN,
    effort: "Medium",
    rationale: `Rated None for ${list(x.notMet)}; status ${x.status}, score ${x.score}.`,
  }));
  if (limited.length > 0) {
    recs.push({
      text: `Confirm the framework scope of ${list(limited.map(ref))}.`,
      owner: ownerOf(limited),
      effort: "Low",
      rationale: `Rated against a single framework, so the result rests on that framework alone.`,
    });
  }
  if (f.awaitingReview > 0) {
    recs.push({
      text: "Finish reviewing the controls awaiting review so the results cover the full set.",
      owner: OWNER_TO_ASSIGN,
      effort: "Low",
      rationale: `${f.awaitingReview} ${f.awaitingReview === 1 ? "control awaiting review is" : "controls awaiting review are"} not included.`,
    });
  }
  const lowest = f.controls
    .filter((c) => c.status === "Partially Aligned" && c.score !== "n/a")
    .sort((a, b) => Number(a.score) - Number(b.score))
    .slice(0, 2);
  // Fill to at least 3 recommendations, most specific first.
  const fillers: Recommendation[] = [
    ...(lowest.length > 0
      ? [
          {
            text: `Start improvement work with the lowest-scored Partially Aligned controls: ${list(lowest.map((c) => `${ref(c)} (${c.score})`))}.`,
            owner: ownerOf(lowest),
            effort: "Medium",
            rationale: "These are the weakest results that are not yet gaps.",
          },
        ]
      : []),
    {
      text: "Keep the mappings under periodic review as controls and frameworks change.",
      owner: OWNER_TO_ASSIGN,
      effort: "Low",
      rationale: "Controls and frameworks change, so mappings go out of date.",
    },
    {
      text: "Collect evidence for the confirmed controls before any assurance work.",
      owner: OWNER_TO_ASSIGN,
      effort: "Medium",
      rationale: "This report covers alignment of control descriptions only.",
    },
  ];
  for (const r of fillers) if (recs.length < 5) recs.push(r);

  const method =
    "Controls came from the PUC sample control set or were entered by the analyst. An AI model suggested requirement IDs, ratings and rationales " +
    "from the reference catalogs, and the analyst reviewed, edited and confirmed every mapping. Code calculated every figure in this report: " +
    `Full scores 1, Partial 0.5 and None 0, and N/A is left out. A control is Fully Aligned at ${THRESHOLDS.fullyAlignedMin} or higher with no None, ` +
    `Gap Identified below ${THRESHOLDS.gapBelow} (or below ${THRESHOLDS.gapWithNoneBelow} with a None), and Partially Aligned otherwise. ` +
    "Limitations: ratings judge each control as described, against the framework text summarized in the catalogs. " +
    `Results cover the ${n} confirmed control${n === 1 ? "" : "s"} only, and the organization is fictional.`;

  return { sections: { keyMessages, decisionRequested, purpose, strengths, gapsAndRisks, method }, recommendations: recs.slice(0, 5) };
}
