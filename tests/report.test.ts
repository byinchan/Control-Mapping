import { test } from "node:test";
import assert from "node:assert/strict";
import { ID_INDEX } from "../lib/catalog/catalogs.ts";
import { FRAMEWORK_IDS, type FrameworkId } from "../lib/catalog/types.ts";
import { checkClaims, checkNumbers, checkReferences, checkSection, sectionBlocks } from "../lib/report/checks.ts";
import { allowedNumbers, buildFacts, factsFingerprint } from "../lib/report/facts.ts";
import {
  SECTION_KEYS,
  approveReport,
  createReport,
  editSection,
  estimatePrintedPages,
  isOutOfDate,
  markChecked,
  reconcile,
  redraft,
  reportBlockers,
  setPreparedBy,
} from "../lib/report/report.ts";
import { templateSections } from "../lib/report/template.ts";
import type { Rating } from "../lib/scoring/config.ts";
import { PUC_SAMPLES } from "../lib/workflow/samples.ts";
import { STORAGE_KEY, loadWorkspace, validateWorkspace } from "../lib/workflow/storage.ts";
import { confirmControl, editFramework, emptyWorkspace, loadSample, reopenControl, type Workspace } from "../lib/workflow/workspace.ts";

const T = "2026-10-11T10:00:00.000Z";
const [NIST, ISO, CIS, SOC2] = FRAMEWORK_IDS;
const IDS: Record<FrameworkId, string> = { [NIST]: "PR.AA-03", [ISO]: "A.8.5", [CIS]: "6.3", [SOC2]: "CC6.1" } as Record<FrameworkId, string>;

function rateAndConfirm(ws: Workspace, id: string, ratings: Rating[]): Workspace {
  FRAMEWORK_IDS.forEach((f, i) => {
    const rating = ratings[i];
    ws = editFramework(ws, id, f, rating === "na" ? { rating, ids: [], naReason: "Nothing on this topic", rationale: "" } : { rating, ids: [IDS[f]], rationale: `Why ${rating}` }, T);
  });
  const res = confirmControl(ws, id, ID_INDEX, T);
  assert.deepEqual(res.blockers, [], id);
  return res.ws;
}

/** 7 controls: 2 Fully, 3 Partially (one with a None, one limited coverage), 1 Gap, 1 awaiting review. */
function sampleWorkspace(): Workspace {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES.slice(0, 7), T);
  ws = rateAndConfirm(ws, "C001", ["full", "full", "full", "full"]);
  ws = rateAndConfirm(ws, "C002", ["full", "full", "full", "na"]);
  ws = rateAndConfirm(ws, "C003", ["full", "none", "full", "full"]);
  ws = rateAndConfirm(ws, "C004", ["partial", "partial", "full", "partial"]);
  ws = rateAndConfirm(ws, "C005", ["none", "partial", "none", "na"]);
  ws = rateAndConfirm(ws, "C006", ["partial", "na", "na", "na"]);
  return ws; // C007 stays awaiting review
}

test("facts: confirmed controls only, with counts, percents, gaps and owners from code", () => {
  const f = buildFacts(sampleWorkspace());
  assert.equal(f.confirmed, 6);
  assert.equal(f.awaitingReview, 1);
  assert.deepEqual(f.statusCounts, { "Fully Aligned": 2, "Partially Aligned": 3, "Gap Identified": 1 });
  assert.deepEqual(f.statusPercents, { "Fully Aligned": "33%", "Partially Aligned": "50%", "Gap Identified": "17%" });
  assert.equal(f.limitedCoverage, 1);
  assert.deepEqual(f.gaps.map((g) => [g.id, g.notMet]), [["C003", ["ISO/IEC 27001:2022"]], ["C005", ["NIST CSF 2.0", "CIS Controls v8.1"]]]);
  assert.ok(!f.controls.some((c) => c.id === "C007"));
  assert.deepEqual(f.owners, ["Infrastructure Manager", "SOC Manager", "GRC Manager"]);
});

test("template draft passes its own checks: all sample controls, a single control, and with gaps", () => {
  // All 14 confirmed
  let all = loadSample(emptyWorkspace(), PUC_SAMPLES, T);
  for (const s of PUC_SAMPLES) all = rateAndConfirm(all, s.id, ["full", "partial", "full", "na"]);
  // One confirmed
  const one = rateAndConfirm(loadSample(emptyWorkspace(), PUC_SAMPLES.slice(0, 3), T), "C002", ["partial", "na", "na", "na"]);
  for (const ws of [sampleWorkspace(), all, one]) {
    const f = buildFacts(ws);
    const texts = templateSections(f);
    for (const k of SECTION_KEYS) {
      const c = checkSection(texts[k], f);
      assert.deepEqual(c.numbers, [], `${k} numbers: ${texts[k]}`);
      assert.deepEqual(c.references, [], `${k} references`);
      assert.deepEqual(c.claims, [], `${k} claims`);
    }
    const r = setPreparedBy(createReport(f, texts, "template", null, T), "B. Chan, GRC Analyst");
    assert.deepEqual(reportBlockers(r, f), []);
    const recs = texts.recommendations.split("\n");
    assert.ok(recs.length >= 3 && recs.length <= 5, `3 to 5 recommendations, got ${recs.length}`);
  }
});

test("template draft states the code's figures", () => {
  const f = buildFacts(sampleWorkspace());
  const t = templateSections(f);
  // Key messages do not repeat the headline status counts.
  assert.doesNotMatch(t.keyMessages, /Fully Aligned|Partially Aligned|Gap Identified/);
  assert.match(t.keyMessages, /1 control awaiting review is not included/);
  assert.match(t.keyMessages, /Results for C006 .* rest on a single framework/);
  assert.match(t.gapsAndRisks, /C005 .*NIST CSF 2\.0 and CIS Controls v8\.1 has a requirement this control, as described, doesn't meet/);
  // "Not implemented or effective" lives in the fixed report footer only, not in the editable text.
  for (const k of SECTION_KEYS) assert.doesNotMatch(t[k], /implemented|effective/, k);
  const recs = t.recommendations.split("\n");
  assert.ok(recs.length >= 3 && recs.length <= 5);
});

test("number check: wrong counts and percents are flagged with what the code says", () => {
  const f = buildFacts(sampleWorkspace());
  assert.deepEqual(checkNumbers("2 of 6 confirmed controls are Fully Aligned.", f), []);
  assert.deepEqual(checkNumbers("9 of 6 confirmed controls are Fully Aligned.", f), [{ quote: "9 Fully Aligned", message: "code says 2" }]);
  assert.deepEqual(checkNumbers("2 of 7 confirmed controls are Fully Aligned.", f), [{ quote: "7 confirmed controls", message: "code says 6" }]);
  assert.deepEqual(checkNumbers("Three controls are Partially Aligned.", f), []);
  assert.deepEqual(checkNumbers("Four controls are Partially Aligned.", f), [{ quote: "Four Partially Aligned", message: "code says 3" }]);
  assert.deepEqual(checkNumbers("33% of confirmed controls are Fully Aligned.", f), []);
  assert.deepEqual(checkNumbers("40% are Fully Aligned.", f), [{ quote: "40% Fully Aligned", message: "code says 33%" }]);
  assert.deepEqual(checkNumbers("2 controls are awaiting review.", f), [{ quote: "2 awaiting review", message: "code says 1" }]);
});

test("number check: figures not computed by code are flagged; code figures pass", () => {
  const f = buildFacts(sampleWorkspace());
  assert.ok(allowedNumbers(f).has(0.75)); // C004 score
  assert.deepEqual(checkNumbers("C004 scores 0.75 and the threshold is 0.9.", f), []);
  assert.equal(checkNumbers("Coverage improved by 23 points.", f).length, 1);
  assert.equal(checkNumbers("A 0.71 average.", f)[0].message.startsWith("not a figure computed by code"), true);
});

test("number check ignores framework names, versions, control and requirement IDs, dates and list numbers", () => {
  const f = buildFacts(sampleWorkspace());
  const text = [
    "NIST CSF 2.0, ISO/IEC 27001:2022, CIS Controls v8.1 and SOC 2 were used on 2026-10-11.",
    "C003 and C005 map to PR.AA-03, A.5.15, CC6.1, A1.2, P6.4 and CIS 13.10; safeguards 6.3 and 6.4 also apply.",
    "1. Review C005.",
  ].join("\n");
  assert.deepEqual(checkNumbers(text, f), []);
});

test("reference check: control IDs must be confirmed controls in this report", () => {
  const f = buildFacts(sampleWorkspace());
  assert.deepEqual(checkReferences("Review C003 and C005.", f), []);
  assert.deepEqual(checkReferences("Review C007 and A099.", f), [
    { quote: "C007", message: "not a confirmed control in this report" },
    { quote: "A099", message: "not a confirmed control in this report" },
  ]);
});

test("claim check warns on implementation or effectiveness claims, skips deliberate negations, never blocks", () => {
  assert.equal(checkClaims("The controls are effective and fully implemented.").length, 2);
  assert.equal(checkClaims("PUC is compliant with SOC 2.").length, 1);
  assert.deepEqual(checkClaims("This report does not show that controls are implemented or effective."), []);
  assert.deepEqual(checkClaims("Security awareness training aligns well."), []); // "security" is not "secure"
  const f = buildFacts(sampleWorkspace());
  const c = checkSection("The controls are effective.", f);
  assert.equal(c.claims.length, 1);
  assert.equal(sectionBlocks(c), false);
});

test("approval: blocked by number flags, allowed with claim warnings, cleared by any edit", () => {
  const f = buildFacts(sampleWorkspace());
  let r = setPreparedBy(createReport(f, templateSections(f), "template", null, T), "BC, GRC Analyst");
  r = editSection(r, "keyMessages", "9 of 6 confirmed controls are Fully Aligned.");
  assert.deepEqual(approveReport(r, f, T).blockers, ["Key messages: 1 figure or reference to fix."]);
  r = editSection(r, "keyMessages", "2 of 6 confirmed controls are Fully Aligned, and they look effective.");
  const ok = approveReport(r, f, T);
  assert.deepEqual(ok.blockers, []); // claim word warns only
  assert.ok(ok.report.approved);
  assert.equal(editSection(ok.report, "strengths", "Edited.").approved, null);
  assert.equal(setPreparedBy(ok.report, "B. Chan").approved, null);
});

test("out of date: changing confirmations clears approval until the narrative is checked again", () => {
  let ws = sampleWorkspace();
  const f1 = buildFacts(ws);
  const approved = approveReport(setPreparedBy(createReport(f1, templateSections(f1), "template", null, T), "BC, GRC Analyst"), f1, T).report;
  assert.ok(approved.approved);
  ws = reopenControl(ws, "C001", T);
  const f2 = buildFacts(ws);
  assert.notEqual(factsFingerprint(f1), factsFingerprint(f2));
  assert.equal(isOutOfDate(approved, f2), true);
  assert.equal(reconcile(approved, f2).approved, null);
  assert.match(reportBlockers(approved, f2).join(" "), /Confirmations changed/);
  const checked = markChecked(approved, f2);
  assert.equal(isOutOfDate(checked, f2), false);
  // The old narrative's figures no longer match: "2 of 6" is now wrong.
  assert.ok(reportBlockers(checked, f2).some((b) => b.startsWith("Key messages")));
});

test("redraft: keep edited sections or replace everything; approval cleared", () => {
  const f = buildFacts(sampleWorkspace());
  let r = setPreparedBy(createReport(f, templateSections(f), "template", null, T), "Analyst");
  r = editSection(r, "strengths", "My own strengths text.");
  const texts = Object.fromEntries(SECTION_KEYS.map((k) => [k, `New ${k}`])) as ReturnType<typeof templateSections>;
  const kept = redraft(r, f, texts, "ai", "claude-haiku-5-5", T, true);
  assert.equal(kept.sections.strengths.text, "My own strengths text.");
  assert.equal(kept.sections.keyMessages.text, "New keyMessages");
  assert.equal(kept.preparedBy, "Analyst");
  assert.equal(redraft(r, f, texts, "ai", null, T, false).sections.strengths.text, "New strengths");
});

test("storage: a report round-trips; bad report data is discarded; older tabs without a report load", () => {
  const ws = sampleWorkspace();
  const f = buildFacts(ws);
  const withReport = { ...ws, report: createReport(f, templateSections(f), "template", null, T) };
  assert.notEqual(validateWorkspace(JSON.parse(JSON.stringify(withReport)), ID_INDEX), null);
  assert.notEqual(validateWorkspace(JSON.parse(JSON.stringify(ws)), ID_INDEX), null); // no report field
  const bad = JSON.parse(JSON.stringify(withReport));
  bad.report.sections.keyMessages.text = "x".repeat(5000);
  assert.equal(validateWorkspace(bad, ID_INDEX), null);
  const m = new Map([[STORAGE_KEY, JSON.stringify({ ...bad, report: { ...bad.report, approved: "yes" } })]]);
  const loaded = loadWorkspace({ getItem: (k) => m.get(k) ?? null, setItem: () => {}, removeItem: (k) => void m.delete(k) }, ID_INDEX);
  assert.equal(loaded.discarded, true);
});

test("print length estimate: short reports fit, long narrative is flagged as over 2 pages", () => {
  const f = buildFacts(sampleWorkspace());
  const r = createReport(f, templateSections(f), "template", null, T);
  assert.ok(estimatePrintedPages(r, f) <= 2);
  const long = editSection(editSection(r, "gapsAndRisks", "x".repeat(2000)), "strengths", "y".repeat(2000));
  const longer = editSection(editSection(long, "recommendations", "z".repeat(2000)), "keyMessages", "w".repeat(2000));
  assert.ok(estimatePrintedPages(longer, f) > 2);
});

test("prepared by: required before approval; whitespace does not count; editing it clears approval", () => {
  const f = buildFacts(sampleWorkspace());
  const draft = createReport(f, templateSections(f), "template", null, T);
  const blocker = "Prepared by: add your name or initials and role.";
  assert.deepEqual(approveReport(draft, f, T).blockers, [blocker]);
  assert.equal(approveReport(draft, f, T).report.approved, null);
  assert.deepEqual(approveReport(setPreparedBy(draft, "   \t "), f, T).blockers, [blocker]);
  // Listed together with the other blockers, not instead of them.
  const both = editSection(draft, "keyMessages", "9 of 6 confirmed controls are Fully Aligned.");
  assert.deepEqual(approveReport(both, f, T).blockers, [blocker, "Key messages: 1 figure or reference to fix."]);
  // Initials and role are enough.
  const ok = approveReport(setPreparedBy(draft, " BC, GRC Analyst "), f, T);
  assert.deepEqual(ok.blockers, []);
  assert.ok(ok.report.approved);
  // Editing the name after approval clears approval like any other edit; emptying it blocks again.
  const renamed = setPreparedBy(ok.report, "Bernadette Chan, GRC Analyst");
  assert.equal(renamed.approved, null);
  const emptied = setPreparedBy(ok.report, "");
  assert.equal(emptied.approved, null);
  assert.deepEqual(approveReport(emptied, f, T).blockers, [blocker]);
});

test("two-decimal figures: the facts pack holds what is shown, so rounded figures pass and unrounded ones are flagged", () => {
  const f = buildFacts(sampleWorkspace());
  // C006: one framework Partial -> 0.5, shown as 0.50; NIST average over 6 controls rounds to two decimals.
  assert.equal(f.controls.find((c) => c.id === "C006")?.score, "0.50");
  const nist = f.coverage.find((c) => c.name === "NIST CSF 2.0")!;
  assert.match(nist.average, /^\d\.\d{2}$/);
  assert.deepEqual(checkNumbers(`C006 scores 0.50 and NIST CSF 2.0 averages ${nist.average}.`, f), []);
  // The unrounded value is not what is shown, so it is not accepted.
  const exact = (1 + 1 + 1 + 0.5 + 0 + 0.5) / 6; // 0.6666…, shown as 0.67
  assert.equal(nist.average, "0.67");
  assert.equal(checkNumbers(`NIST CSF 2.0 averages ${exact.toFixed(3)}.`, f).length, 1);
  // The template's own figures are the rounded ones and pass.
  const t = templateSections(f);
  for (const k of SECTION_KEYS) assert.deepEqual(checkNumbers(t[k], f), [], k);
});
