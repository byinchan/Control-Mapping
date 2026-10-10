// The analyst's workspace for the current browser tab: pure data and pure update functions.
// No React, no storage. The UI calls these; it never decides workflow rules itself.
import { isValidId, type IdIndex } from "../catalog/ids.ts";
import { FRAMEWORK_IDS, type FrameworkId } from "../catalog/types.ts";
import type { Guardrails, MappingMode, Proposal, ControlInput } from "../mapping/types.ts";
import type { Rating } from "../scoring/config.ts";
import type { ControlRatings } from "../scoring/score.ts";

export const WORKSPACE_VERSION = 2;
export const MAX_CONTROLS = 50;
export const MAX_HISTORY = 50;
/** AI suggestions kept per control: the current one plus this many earlier ones (3 in total). */
export const MAX_EARLIER_AI = 2;

export type FrameworkWork = {
  ids: string[];
  rating: Rating | null;
  rationale: string;
  naReason: string;
  /** Who produced the current values: the AI proposal, or the analyst from scratch. */
  source: "ai" | "analyst";
  /** True once the analyst changes anything in this framework. */
  edited: boolean;
};

export type AiRecord = {
  requestId: string;
  mode: MappingMode;
  model: string | null;
  receivedAt: string;
  /** The control text the suggestion was made for. */
  input: ControlInput;
  proposal: Proposal;
  guardrails: Guardrails;
  notices: string[];
};

/** Short record of an earlier AI suggestion that was replaced (kept for History). */
export type EarlierAi = {
  requestId: string;
  mode: MappingMode;
  model: string | null;
  receivedAt: string;
  replacedAt: string;
  frameworks: Record<FrameworkId, { ids: string[]; rating: Rating }>;
};

export type HistoryEvent = { at: string; event: "created" | "ai-proposal" | "edited" | "confirmed" | "reopened"; detail: string };

export type ConfirmedRecord = {
  at: string;
  control: ControlInput;
  mapping: Record<FrameworkId, { ids: string[]; rating: Rating; rationale: string; naReason: string }>;
};

export type ControlRecord = {
  id: string;
  /** C001-C014 when loaded from the PUC sample, otherwise null. */
  sampleId: string | null;
  /** Control text as first entered or loaded. */
  original: ControlInput;
  /** Control text now (after analyst edits). */
  current: ControlInput;
  ai: AiRecord | null;
  /** Earlier AI suggestions, newest first, at most MAX_EARLIER_AI. */
  earlierAi: EarlierAi[];
  mapping: Record<FrameworkId, FrameworkWork>;
  confirmed: ConfirmedRecord | null;
  history: HistoryEvent[];
};

export type Workspace = { version: typeof WORKSPACE_VERSION; controls: ControlRecord[]; nextAnalystNumber: number };

export const emptyWorkspace = (): Workspace => ({ version: WORKSPACE_VERSION, controls: [], nextAnalystNumber: 1 });

const emptyWork = (): FrameworkWork => ({ ids: [], rating: null, rationale: "", naReason: "", source: "analyst", edited: false });
const emptyMapping = () => Object.fromEntries(FRAMEWORK_IDS.map((f) => [f, emptyWork()])) as Record<FrameworkId, FrameworkWork>;

function withHistory(record: ControlRecord, event: HistoryEvent): ControlRecord {
  const last = record.history.at(-1);
  // Collapse repeated edits of the same field (one entry per typing session, not per keystroke).
  if (event.event === "edited" && last?.event === "edited" && last.detail === event.detail) {
    return { ...record, history: [...record.history.slice(0, -1), event] };
  }
  return { ...record, history: [...record.history, event].slice(-MAX_HISTORY) };
}

function update(ws: Workspace, id: string, fn: (r: ControlRecord) => ControlRecord): Workspace {
  return { ...ws, controls: ws.controls.map((r) => (r.id === id ? fn(r) : r)) };
}

export const findControl = (ws: Workspace, id: string) => ws.controls.find((c) => c.id === id) ?? null;

// ---------- status and badges ----------

export type ControlStatus = "draft" | "awaiting-review" | "confirmed";

/** Draft: nothing to review yet. Awaiting review: has a mapping that is not confirmed. Confirmed: counts in results. */
export function controlStatus(r: ControlRecord): ControlStatus {
  if (r.confirmed) return "confirmed";
  const anything = FRAMEWORK_IDS.some((f) => r.mapping[f].rating !== null || r.mapping[f].ids.length > 0);
  return r.ai || anything ? "awaiting-review" : "draft";
}

export type ItemBadge = "AI-suggested" | "Human-edited" | "Confirmed" | "Not mapped";

export function itemBadge(r: ControlRecord, f: FrameworkId): ItemBadge {
  if (r.confirmed) return "Confirmed";
  const w = r.mapping[f];
  if (w.rating === null && w.ids.length === 0 && !w.rationale) return "Not mapped";
  return w.source === "ai" && !w.edited ? "AI-suggested" : "Human-edited";
}

const sameText = (a: ControlInput, b: ControlInput) =>
  (["name", "description", "objective", "activity", "owner"] as const).every((k) => (a[k] ?? "") === (b[k] ?? ""));

/** True when the control text changed after the AI suggestion was made. */
export const aiIsStale = (r: ControlRecord) => r.ai !== null && !sameText(r.ai.input, r.current);

/** True when the analyst changed the control text after it was entered or loaded. */
export const textEdited = (r: ControlRecord) => !sameText(r.original, r.current);

// ---------- actions ----------

export function addControl(ws: Workspace, input: ControlInput, now: string): { ws: Workspace; id: string | null } {
  if (ws.controls.length >= MAX_CONTROLS) return { ws, id: null };
  const id = `A${String(ws.nextAnalystNumber).padStart(3, "0")}`;
  const record: ControlRecord = {
    id,
    sampleId: null,
    original: input,
    current: input,
    ai: null,
    earlierAi: [],
    mapping: emptyMapping(),
    confirmed: null,
    history: [{ at: now, event: "created", detail: "Entered by analyst" }],
  };
  return { ws: { ...ws, controls: [...ws.controls, record], nextAnalystNumber: ws.nextAnalystNumber + 1 }, id };
}

/** Adds the PUC sample controls that are not already in the workspace. Keeps the v1 IDs. */
export function loadSample(ws: Workspace, samples: readonly { id: string; input: ControlInput }[], now: string): Workspace {
  const have = new Set(ws.controls.map((c) => c.id));
  const room = MAX_CONTROLS - ws.controls.length;
  const added: ControlRecord[] = samples
    .filter((s) => !have.has(s.id))
    .slice(0, Math.max(0, room))
    .map((s) => ({
      id: s.id,
      sampleId: s.id,
      original: s.input,
      current: s.input,
      ai: null,
      earlierAi: [],
      mapping: emptyMapping(),
      confirmed: null,
      history: [{ at: now, event: "created", detail: "Loaded from PUC sample (v1)" }],
    }));
  const order = new Map(samples.map((s, i) => [s.id, i]));
  const controls = [...ws.controls, ...added].sort((a, b) => {
    const ai = order.get(a.id);
    const bi = order.get(b.id);
    return ai !== undefined && bi !== undefined ? ai - bi : ai !== undefined ? -1 : bi !== undefined ? 1 : 0;
  });
  return { ...ws, controls };
}

export function editControlText(ws: Workspace, id: string, field: keyof ControlInput, value: string, now: string): Workspace {
  return update(ws, id, (r) => {
    if (r.confirmed) return r; // confirmed records are locked; reopen first
    const current = { ...r.current, [field]: value };
    return withHistory({ ...r, current }, { at: now, event: "edited", detail: `control ${field}` });
  });
}

/** Frameworks the analyst has changed since the last AI suggestion (or entered by hand). */
export const editedFrameworks = (r: ControlRecord): FrameworkId[] => FRAMEWORK_IDS.filter((f) => r.mapping[f].edited);

const summarizeAi = (ai: AiRecord, replacedAt: string): EarlierAi => ({
  requestId: ai.requestId,
  mode: ai.mode,
  model: ai.model,
  receivedAt: ai.receivedAt,
  replacedAt,
  frameworks: Object.fromEntries(
    FRAMEWORK_IDS.map((f) => [f, { ids: [...ai.proposal.frameworks[f].ids], rating: ai.proposal.frameworks[f].rating }]),
  ) as EarlierAi["frameworks"],
});

/**
 * Puts a new AI proposal into the working mapping. With keepEdited, frameworks the analyst changed
 * keep the analyst's values; otherwise every framework is replaced. The previous suggestion is kept
 * (in short form) in earlierAi, so at most three suggestions per control are stored.
 */
export function applyAiResult(ws: Workspace, id: string, ai: AiRecord, now: string, keepEdited = false): Workspace {
  return update(ws, id, (r) => {
    if (r.confirmed) return r;
    const mapping = Object.fromEntries(
      FRAMEWORK_IDS.map((f) => {
        if (keepEdited && r.mapping[f].edited) return [f, r.mapping[f]];
        const p = ai.proposal.frameworks[f];
        return [f, { ids: [...p.ids], rating: p.rating, rationale: p.rationale, naReason: p.naReason ?? "", source: "ai", edited: false }];
      }),
    ) as Record<FrameworkId, FrameworkWork>;
    const earlierAi = r.ai ? [summarizeAi(r.ai, now), ...r.earlierAi].slice(0, MAX_EARLIER_AI) : r.earlierAi;
    const kept = keepEdited ? FRAMEWORK_IDS.filter((f) => r.mapping[f].edited) : [];
    const detail = `${ai.mode === "live" ? "Live AI" : ai.mode === "demo" ? "Demo (saved AI output)" : "Mock mapper"}${ai.model ? `, ${ai.model}` : ""}${
      kept.length ? `; kept analyst edits in ${kept.join(", ")}` : ""
    }`;
    return withHistory({ ...r, ai, earlierAi, mapping }, { at: now, event: "ai-proposal", detail });
  });
}

/** True when the analyst's value for this framework differs from the AI's original suggestion. */
export function differsFromAi(r: ControlRecord, f: FrameworkId): boolean {
  const p = r.ai?.proposal.frameworks[f];
  if (!p) return false;
  const w = r.confirmed ? r.confirmed.mapping[f] : r.mapping[f];
  return (
    p.rating !== w.rating ||
    p.rationale !== w.rationale ||
    (p.naReason ?? "") !== w.naReason ||
    JSON.stringify(p.ids) !== JSON.stringify(w.ids)
  );
}

export type FrameworkPatch = Partial<Pick<FrameworkWork, "ids" | "rating" | "rationale" | "naReason">>;

export function editFramework(ws: Workspace, id: string, f: FrameworkId, patch: FrameworkPatch, now: string): Workspace {
  return update(ws, id, (r) => {
    if (r.confirmed) return r;
    const w = { ...r.mapping[f], ...patch, edited: true };
    if (patch.ids) w.ids = [...new Set(patch.ids)];
    const field = Object.keys(patch).join(", ");
    return withHistory({ ...r, mapping: { ...r.mapping, [f]: w } }, { at: now, event: "edited", detail: `${f} ${field}` });
  });
}

/** Reasons the control cannot be confirmed yet; empty means it can. */
export function confirmBlockers(r: ControlRecord, index: IdIndex): string[] {
  const problems: string[] = [];
  if (!r.current.name.trim() || !r.current.description.trim()) problems.push("The control needs a name and a description.");
  for (const f of FRAMEWORK_IDS) {
    const w = r.mapping[f];
    if (w.rating === null) problems.push(`${f}: choose a rating.`);
    else if (w.rating === "na") {
      if (!w.naReason.trim()) problems.push(`${f}: N/A needs a reason.`);
      if (w.ids.length > 0) problems.push(`${f}: remove the IDs or change the rating from N/A.`);
    } else if (w.ids.length === 0) problems.push(`${f}: add at least one requirement ID, or rate it N/A.`);
    const unknown = w.ids.filter((id) => !isValidId(index, f, id));
    if (unknown.length) problems.push(`${f}: not in the catalog: ${unknown.join(", ")}.`);
  }
  return problems;
}

export function confirmControl(ws: Workspace, id: string, index: IdIndex, now: string): { ws: Workspace; blockers: string[] } {
  const r = findControl(ws, id);
  if (!r) return { ws, blockers: ["Control not found."] };
  if (r.confirmed) return { ws, blockers: [] };
  const blockers = confirmBlockers(r, index);
  if (blockers.length) return { ws, blockers };
  const mapping = Object.fromEntries(
    FRAMEWORK_IDS.map((f) => {
      const w = r.mapping[f];
      return [f, { ids: [...w.ids], rating: w.rating as Rating, rationale: w.rationale, naReason: w.rating === "na" ? w.naReason.trim() : "" }];
    }),
  ) as ConfirmedRecord["mapping"];
  return {
    ws: update(ws, id, (x) => withHistory({ ...x, confirmed: { at: now, control: { ...x.current }, mapping } }, { at: now, event: "confirmed", detail: "Confirmed by analyst" })),
    blockers: [],
  };
}

export function reopenControl(ws: Workspace, id: string, now: string): Workspace {
  return update(ws, id, (r) => (r.confirmed ? withHistory({ ...r, confirmed: null }, { at: now, event: "reopened", detail: "Reopened for review" }) : r));
}

export const removeControl = (ws: Workspace, id: string): Workspace => ({ ...ws, controls: ws.controls.filter((c) => c.id !== id) });

/** Ratings of a confirmed control, in the shape the scoring engine takes. */
export function confirmedRatings(r: ControlRecord): ControlRatings | null {
  if (!r.confirmed) return null;
  return Object.fromEntries(
    FRAMEWORK_IDS.map((f) => {
      const m = r.confirmed!.mapping[f];
      return [f, m.rating === "na" ? { rating: "na", naReason: m.naReason } : { rating: m.rating }];
    }),
  ) as ControlRatings;
}
