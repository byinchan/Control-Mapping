import { test } from "node:test";
import assert from "node:assert/strict";
import { ID_INDEX } from "../lib/catalog/catalogs.ts";
import { FRAMEWORK_IDS } from "../lib/catalog/types.ts";
import type { Proposal } from "../lib/mapping/types.ts";
import { scoreControl } from "../lib/scoring/score.ts";
import { PUC_SAMPLES } from "../lib/workflow/samples.ts";
import { STORAGE_KEY, loadWorkspace, saveWorkspace, validateWorkspace } from "../lib/workflow/storage.ts";
import {
  MAX_CONTROLS,
  addControl,
  aiIsStale,
  applyAiResult,
  confirmBlockers,
  confirmControl,
  confirmedRatings,
  controlStatus,
  editControlText,
  editFramework,
  emptyWorkspace,
  findControl,
  itemBadge,
  loadSample,
  MAX_EARLIER_AI,
  nextAwaitingId,
  differsFromAi,
  editedFrameworks,
  reopenControl,
  textEdited,
  type AiRecord,
} from "../lib/workflow/workspace.ts";

const T = "2026-10-10T10:00:00.000Z";
const [NIST, ISO, CIS, SOC2] = FRAMEWORK_IDS;

function proposal(): Proposal {
  return {
    frameworks: {
      [NIST]: { ids: ["PR.AA-03"], rating: "full", rationale: "r", naReason: null },
      [ISO]: { ids: ["A.8.5"], rating: "partial", rationale: "r", naReason: null },
      [CIS]: { ids: [], rating: "na", rationale: "r", naReason: "Not covered" },
      [SOC2]: { ids: ["CC6.1"], rating: "partial", rationale: "r", naReason: null },
    } as Proposal["frameworks"],
    uncertainties: ["u"],
    missingInformation: [],
  };
}

const ai = (input = PUC_SAMPLES[0].input): AiRecord => ({
  requestId: "req-1",
  mode: "demo",
  model: "claude-haiku-5-5",
  receivedAt: T,
  input,
  proposal: proposal(),
  guardrails: { droppedIds: [{ framework: ISO, id: "A.9.2.1" }], truncatedInput: [], truncatedOutput: [], warnings: [] },
  notices: ["1 suggested ID was not in the catalog and was removed: A.9.2.1."],
});

const fakeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

test("load sample: adds C001-C014 once, in v1 order, keeping analyst controls", () => {
  let ws = addControl(emptyWorkspace(), { name: "Custom", description: "d" }, T).ws;
  ws = loadSample(ws, PUC_SAMPLES, T);
  ws = loadSample(ws, PUC_SAMPLES, T);
  assert.equal(ws.controls.length, 15);
  assert.deepEqual(ws.controls.slice(0, 3).map((c) => c.id), ["C001", "C002", "C003"]);
  assert.equal(ws.controls.at(-1)?.id, "A001");
  assert.equal(findControl(ws, "C001")?.sampleId, "C001");
  assert.equal(controlStatus(findControl(ws, "C001")!), "draft");
});

test("add control: analyst IDs A001, A002...; capped at MAX_CONTROLS", () => {
  let ws = emptyWorkspace();
  const ids: (string | null)[] = [];
  for (let i = 0; i < MAX_CONTROLS + 1; i++) {
    const r = addControl(ws, { name: `n${i}`, description: "d" }, T);
    ws = r.ws;
    ids.push(r.id);
  }
  assert.equal(ids[0], "A001");
  assert.equal(ids[1], "A002");
  assert.equal(ids.at(-1), null);
  assert.equal(ws.controls.length, MAX_CONTROLS);
});

test("AI proposal: items start as AI-suggested; analyst edits make them Human-edited", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES, T);
  ws = applyAiResult(ws, "C001", ai(), T);
  let r = findControl(ws, "C001")!;
  assert.equal(controlStatus(r), "awaiting-review");
  assert.equal(itemBadge(r, NIST), "AI-suggested");
  assert.equal(r.history.at(-1)?.detail, "Demo (saved AI output), claude-haiku-5-5");
  ws = editFramework(ws, "C001", ISO, { ids: ["A.8.5", "A.5.15", "A.5.15"] }, T);
  r = findControl(ws, "C001")!;
  assert.equal(itemBadge(r, ISO), "Human-edited");
  assert.deepEqual(r.mapping[ISO].ids, ["A.8.5", "A.5.15"]);
  assert.equal(itemBadge(r, NIST), "AI-suggested");
  // The AI's original proposal is kept unchanged for traceability.
  assert.deepEqual(r.ai?.proposal.frameworks[ISO].ids, ["A.8.5"]);
});

test("analyst can map without AI; badges show Not mapped, then Human-edited", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES, T);
  assert.equal(itemBadge(findControl(ws, "C002")!, CIS), "Not mapped");
  ws = editFramework(ws, "C002", CIS, { ids: ["7.1"], rating: "full" }, T);
  assert.equal(itemBadge(findControl(ws, "C002")!, CIS), "Human-edited");
  assert.equal(controlStatus(findControl(ws, "C002")!), "awaiting-review");
});

test("confirm: blocked until every framework is complete and valid", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES, T);
  ws = applyAiResult(ws, "C001", ai(), T);
  ws = editFramework(ws, "C001", CIS, { naReason: "" }, T);
  ws = editFramework(ws, "C001", SOC2, { ids: [] }, T);
  const blockers = confirmBlockers(findControl(ws, "C001")!, ID_INDEX);
  assert.deepEqual(blockers, [
    "CIS Controls v8.1: say why there is no requirement here.",
    'SOC 2 TSC: add at least one requirement ID, or choose "N/A".',
  ]);
  const res = confirmControl(ws, "C001", ID_INDEX, T);
  assert.equal(res.ws, ws);
  assert.equal(controlStatus(findControl(res.ws, "C001")!), "awaiting-review");
});

test("confirm: snapshots the mapping, locks edits, and feeds the scoring engine", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES, T);
  ws = applyAiResult(ws, "C001", ai(), T);
  const res = confirmControl(ws, "C001", ID_INDEX, T);
  assert.deepEqual(res.blockers, []);
  ws = res.ws;
  const r = findControl(ws, "C001")!;
  assert.equal(controlStatus(r), "confirmed");
  assert.equal(itemBadge(r, NIST), "Confirmed");
  assert.equal(r.confirmed?.mapping[CIS].naReason, "Not covered");
  // Locked: edits are ignored until reopened.
  assert.equal(findControl(editFramework(ws, "C001", NIST, { rating: "none" }, T), "C001")!.mapping[NIST].rating, "full");
  assert.equal(findControl(editControlText(ws, "C001", "name", "x", T), "C001")!.current.name, PUC_SAMPLES[0].input.name);
  // Code calculates from the confirmed values: Full, Partial, Partial (CIS N/A excluded) -> 0.667.
  const score = scoreControl(confirmedRatings(r)!);
  assert.equal(score.status, "Partially Aligned");
  assert.ok(Math.abs((score.score ?? 0) - 2 / 3) < 1e-12);
  // Reopen returns it to review.
  ws = reopenControl(ws, "C001", T);
  assert.equal(controlStatus(findControl(ws, "C001")!), "awaiting-review");
  assert.equal(confirmedRatings(findControl(ws, "C001")!), null);
});

test("confirm: rejects IDs that are not in the catalog", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES, T);
  ws = applyAiResult(ws, "C001", ai(), T);
  ws = editFramework(ws, "C001", NIST, { ids: ["PR.AA-03", "ID.AM-06"] }, T);
  assert.ok(confirmBlockers(findControl(ws, "C001")!, ID_INDEX).includes("NIST CSF 2.0: ID.AM-06 is not in the catalog. Remove it."));
});

test("traceability: original text kept; edits after the AI suggestion mark it stale", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES, T);
  ws = applyAiResult(ws, "C001", ai(), T);
  assert.equal(aiIsStale(findControl(ws, "C001")!), false);
  ws = editControlText(ws, "C001", "description", "Changed text", T);
  ws = editControlText(ws, "C001", "description", "Changed text again", T);
  const r = findControl(ws, "C001")!;
  assert.equal(aiIsStale(r), true);
  assert.equal(textEdited(r), true);
  assert.equal(r.original.description, PUC_SAMPLES[0].input.description);
  assert.equal(r.history.filter((h) => h.detail === "control text: description").length, 1); // repeated edits collapse
});

test("storage: round-trips a valid workspace under the versioned key", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES, T);
  ws = applyAiResult(ws, "C001", ai(), T);
  ws = confirmControl(ws, "C001", ID_INDEX, T).ws;
  const s = fakeStorage();
  assert.equal(saveWorkspace(s, ws), true);
  assert.equal(STORAGE_KEY, "puc-control-mapping:workspace:v2");
  const loaded = loadWorkspace(s, ID_INDEX);
  assert.equal(loaded.discarded, false);
  assert.deepEqual(loaded.ws, ws);
});

test("storage: anything that fails validation is discarded, not partly used", () => {
  const good = applyAiResult(loadSample(emptyWorkspace(), PUC_SAMPLES, T), "C001", ai(), T);
  const cases: [string, (w: any) => void][] = [
    ["wrong version", (w) => (w.version = 1)],
    ["too many earlier AI suggestions", (w) => (w.controls[0].earlierAi = [1, 2, 3].map(() => w.controls[0].earlierAi[0] ?? {}))],
    ["unknown ID in mapping", (w) => (w.controls[0].mapping["cis-v8.1"].ids = ["99.9"])],
    ["bad rating", (w) => (w.controls[0].mapping["nist-csf-2.0"].rating = "high")],
    ["bad control id", (w) => (w.controls[0].id = "<script>")],
    ["duplicate controls", (w) => w.controls.push(w.controls[0])],
    ["over-long name", (w) => (w.controls[1].current.name = "x".repeat(500))],
    ["extra field", (w) => (w.controls[1].current.secret = "x")],
    ["confirmed N/A without reason", (w) => (w.controls[1].confirmed = { at: T, control: w.controls[1].current, mapping: Object.fromEntries(FRAMEWORK_IDS.map((f) => [f, { ids: [], rating: "na", rationale: "", naReason: "" }])) })],
    ["bad AI mode", (w) => (w.controls[0].ai.mode = "admin")],
  ];
  for (const [name, mutate] of cases) {
    const w = structuredClone(good);
    mutate(w);
    assert.equal(validateWorkspace(w, ID_INDEX), null, name);
    const s = fakeStorage();
    s.setItem(STORAGE_KEY, JSON.stringify(w));
    const loaded = loadWorkspace(s, ID_INDEX);
    assert.equal(loaded.discarded, true, name);
    assert.equal(loaded.ws.controls.length, 0, name);
    assert.equal(s.m.has(STORAGE_KEY), false, name);
  }
  const s = fakeStorage();
  s.setItem(STORAGE_KEY, "{not json");
  assert.equal(loadWorkspace(s, ID_INDEX).discarded, true);
});

test("storage: missing or blocked storage starts empty without errors", () => {
  assert.deepEqual(loadWorkspace(null, ID_INDEX), { ws: emptyWorkspace(), discarded: false });
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
  assert.equal(loadWorkspace(throwing, ID_INDEX).discarded, false);
  assert.equal(saveWorkspace(throwing, emptyWorkspace()), false);
});

test("re-running AI: keeps at most 3 suggestions per control (current + 2 earlier), newest first", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES, T);
  for (let i = 1; i <= 5; i++) ws = applyAiResult(ws, "C001", { ...ai(), requestId: `req-${i}` }, T);
  const r = findControl(ws, "C001")!;
  assert.equal(r.ai?.requestId, "req-5");
  assert.equal(MAX_EARLIER_AI, 2);
  assert.deepEqual(r.earlierAi.map((e) => e.requestId), ["req-4", "req-3"]);
  assert.deepEqual(r.earlierAi[0].frameworks[ISO], { ids: ["A.8.5"], rating: "partial" });
  // The capped workspace still passes storage validation.
  assert.notEqual(validateWorkspace(JSON.parse(JSON.stringify(ws)), ID_INDEX), null);
});

test("re-running AI: replace everything, or keep the analyst's edited frameworks", () => {
  let ws = applyAiResult(loadSample(emptyWorkspace(), PUC_SAMPLES, T), "C001", ai(), T);
  ws = editFramework(ws, "C001", SOC2, { rating: "full", rationale: "My call" }, T);
  assert.deepEqual(editedFrameworks(findControl(ws, "C001")!), [SOC2]);

  const kept = findControl(applyAiResult(ws, "C001", { ...ai(), requestId: "req-2" }, T, true), "C001")!;
  assert.equal(kept.mapping[SOC2].rationale, "My call");
  assert.equal(itemBadge(kept, SOC2), "Human-edited");
  assert.equal(itemBadge(kept, NIST), "AI-suggested");
  assert.match(kept.history.at(-1)!.detail, /kept your edits in SOC 2 TSC/);

  const replaced = findControl(applyAiResult(ws, "C001", { ...ai(), requestId: "req-2" }, T, false), "C001")!;
  assert.equal(replaced.mapping[SOC2].rationale, "r");
  assert.deepEqual(editedFrameworks(replaced), []);
});

test("AI original suggestion is shown only where the analyst's values differ from it", () => {
  let ws = applyAiResult(loadSample(emptyWorkspace(), PUC_SAMPLES, T), "C001", ai(), T);
  assert.equal(differsFromAi(findControl(ws, "C001")!, ISO), false);
  ws = editFramework(ws, "C001", ISO, { rationale: "r" }, T); // edited, but same value
  assert.equal(differsFromAi(findControl(ws, "C001")!, ISO), false);
  ws = editFramework(ws, "C001", ISO, { rating: "full" }, T);
  assert.equal(differsFromAi(findControl(ws, "C001")!, ISO), true);
  ws = confirmControl(ws, "C001", ID_INDEX, T).ws;
  assert.equal(differsFromAi(findControl(ws, "C001")!, ISO), true); // still shown on the confirmed control
  assert.equal(differsFromAi(findControl(ws, "C001")!, NIST), false);
});

const INTERNAL_IDS = /\b(nist-csf-2\.0|iso-27001-2022|cis-v8\.1|soc2-tsc-2017)\b/;

test("confirm: a rationale is required for every rated framework; for N/A the reason counts", () => {
  let ws = applyAiResult(loadSample(emptyWorkspace(), PUC_SAMPLES, T), "C001", ai(), T);
  ws = editFramework(ws, "C001", NIST, { rating: "full", rationale: "" }, T);
  ws = editFramework(ws, "C001", SOC2, { rating: "none", rationale: "   " }, T);
  ws = editFramework(ws, "C001", CIS, { rationale: "" }, T); // rated "No requirement here" with a reason: no rationale needed
  const blockers = confirmBlockers(findControl(ws, "C001")!, ID_INDEX);
  assert.deepEqual(blockers, [
    'NIST CSF 2.0: write a rationale explaining the "Full" rating.',
    'SOC 2 TSC: write a rationale explaining the "None" rating.',
  ]);
  assert.deepEqual(confirmControl(ws, "C001", ID_INDEX, T).blockers, blockers);
  ws = editFramework(ws, "C001", NIST, { rationale: "MFA authenticates users." }, T);
  ws = editFramework(ws, "C001", SOC2, { rationale: "Not met as described." }, T);
  assert.deepEqual(confirmControl(ws, "C001", ID_INDEX, T).blockers, []);
});

test("confirm: lists every blocker at once, in plain language without internal IDs", () => {
  let ws = loadSample(emptyWorkspace(), PUC_SAMPLES, T);
  ws = editControlText(ws, "C002", "description", "", T);
  ws = editFramework(ws, "C002", ISO, { ids: ["A.8.8"], rating: "na", naReason: "" }, T);
  ws = editFramework(ws, "C002", SOC2, { ids: ["CC7.1"], rating: "partial", rationale: "" }, T);
  const blockers = confirmBlockers(findControl(ws, "C002")!, ID_INDEX);
  assert.deepEqual(blockers, [
    "Add a control name and a description.",
    "NIST CSF 2.0: choose a rating.",
    "ISO/IEC 27001:2022: say why there is no requirement here.",
    'ISO/IEC 27001:2022: "N/A" can\'t list requirement IDs. Remove the IDs, or change the rating.',
    "CIS Controls v8.1: choose a rating.",
    'SOC 2 TSC: write a rationale explaining the "Partial" rating.',
  ]);
  for (const b of blockers) assert.doesNotMatch(b, INTERNAL_IDS);
  for (const h of findControl(ws, "C002")!.history) assert.doesNotMatch(h.detail, INTERNAL_IDS);
});

test("confirm and next: finds the next control awaiting review, wrapping around, or none when all are confirmed", () => {
  const three = PUC_SAMPLES.slice(0, 3);
  let ws = loadSample(emptyWorkspace(), three, T);
  for (const s of three) ws = applyAiResult(ws, s.id, { ...ai(s.input), requestId: s.id }, T);
  assert.equal(nextAwaitingId(ws, "C001"), "C002");
  ws = confirmControl(ws, "C002", ID_INDEX, T).ws;
  assert.equal(nextAwaitingId(ws, "C001"), "C003"); // skips confirmed C002
  assert.equal(nextAwaitingId(ws, "C003"), "C001"); // wraps around
  ws = confirmControl(ws, "C001", ID_INDEX, T).ws;
  assert.equal(nextAwaitingId(ws, "C003"), null); // only C003 left, and it is the current one
  ws = confirmControl(ws, "C003", ID_INDEX, T).ws;
  assert.equal(nextAwaitingId(ws, "C003"), null);
});

test("storage: saved data from before Activity was removed still loads (activity kept, not required)", () => {
  let ws = addControl(emptyWorkspace(), { name: "Old control", description: "Typed earlier", activity: "Quarterly review" }, T).ws;
  ws = editControlText(ws, "A001", "activity", "Quarterly review, updated", T);
  const s = fakeStorage();
  s.setItem(STORAGE_KEY, JSON.stringify(ws));
  const loaded = loadWorkspace(s, ID_INDEX);
  assert.equal(loaded.discarded, false);
  assert.equal(loaded.ws.controls[0].current.activity, "Quarterly review, updated");
  assert.equal(loaded.ws.controls[0].original.activity, "Quarterly review");
});
