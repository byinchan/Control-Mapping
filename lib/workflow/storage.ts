// Saves the workspace in this browser tab only (sessionStorage). It is gone when the tab closes.
// Everything read back is schema-checked; anything that fails is discarded, never partly used.
import { isValidId, type IdIndex } from "../catalog/ids.ts";
import { FRAMEWORK_IDS } from "../catalog/types.ts";
import { INPUT_LIMITS } from "../mapping/config.ts";
import { RATINGS } from "../scoring/config.ts";
import { MAX_CONTROLS, MAX_EARLIER_AI, MAX_HISTORY, WORKSPACE_VERSION, emptyWorkspace, type Workspace } from "./workspace.ts";

export const STORAGE_KEY = `puc-control-mapping:workspace:v${WORKSPACE_VERSION}`;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 5000): v is string => typeof v === "string" && v.length <= max;
const isStrArr = (v: unknown, max = 50) => Array.isArray(v) && v.length <= max && v.every((x) => isStr(x, 300));
const isRating = (v: unknown) => RATINGS.includes(v as never);
const MODES = ["live", "mock", "demo"];
const EVENTS = ["created", "ai-proposal", "edited", "confirmed", "reopened"];

function validInput(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (!isStr(v.name, INPUT_LIMITS.name) || !isStr(v.description, INPUT_LIMITS.description)) return false;
  for (const k of ["objective", "activity", "owner"] as const) {
    if (v[k] !== undefined && !isStr(v[k], INPUT_LIMITS[k])) return false;
  }
  return Object.keys(v).every((k) => k in INPUT_LIMITS);
}

function validIds(v: unknown, f: (typeof FRAMEWORK_IDS)[number], index: IdIndex): boolean {
  return isStrArr(v, 50) && (v as string[]).every((id) => isValidId(index, f, id));
}

function validAi(v: unknown, index: IdIndex): boolean {
  if (v === null) return true;
  if (!isObj(v) || !isStr(v.requestId, 100) || !MODES.includes(v.mode as string) || !isStr(v.receivedAt, 40)) return false;
  if (v.model !== null && !isStr(v.model, 100)) return false;
  if (!validInput(v.input) || !isStrArr(v.notices, 20)) return false;
  const p = v.proposal;
  if (!isObj(p) || !isObj(p.frameworks) || !isStrArr(p.uncertainties, 10) || !isStrArr(p.missingInformation, 10)) return false;
  for (const f of FRAMEWORK_IDS) {
    const w = (p.frameworks as Obj)[f];
    if (!isObj(w) || !validIds(w.ids, f, index) || !isRating(w.rating) || !isStr(w.rationale, 400)) return false;
    if (w.naReason !== null && !isStr(w.naReason, 300)) return false;
  }
  const g = v.guardrails;
  if (!isObj(g) || !Array.isArray(g.droppedIds) || g.droppedIds.length > 100) return false;
  if (!g.droppedIds.every((d) => isObj(d) && FRAMEWORK_IDS.includes(d.framework as never) && isStr(d.id, 60))) return false;
  return isStrArr(g.truncatedInput, 10) && isStrArr(g.truncatedOutput, 60) && isStrArr(g.warnings, 30);
}

function validRecord(v: unknown, index: IdIndex): boolean {
  if (!isObj(v) || !isStr(v.id, 10) || !/^(C0(0[1-9]|1[0-4])|A\d{3})$/.test(v.id)) return false;
  if (v.sampleId !== null && v.sampleId !== v.id) return false;
  if (!validInput(v.original) || !validInput(v.current) || !validAi(v.ai, index)) return false;
  if (!Array.isArray(v.earlierAi) || v.earlierAi.length > MAX_EARLIER_AI) return false;
  for (const e of v.earlierAi) {
    if (!isObj(e) || !isStr(e.requestId, 100) || !MODES.includes(e.mode as string) || !isStr(e.receivedAt, 40) || !isStr(e.replacedAt, 40)) return false;
    if (e.model !== null && !isStr(e.model, 100)) return false;
    if (!isObj(e.frameworks)) return false;
    for (const f of FRAMEWORK_IDS) {
      const w = (e.frameworks as Obj)[f];
      if (!isObj(w) || !validIds(w.ids, f, index) || !isRating(w.rating)) return false;
    }
  }
  if (!isObj(v.mapping)) return false;
  for (const f of FRAMEWORK_IDS) {
    const w = (v.mapping as Obj)[f];
    if (!isObj(w) || !validIds(w.ids, f, index)) return false;
    if (w.rating !== null && !isRating(w.rating)) return false;
    if (!isStr(w.rationale, 2000) || !isStr(w.naReason, 500)) return false;
    if (w.source !== "ai" && w.source !== "analyst") return false;
    if (typeof w.edited !== "boolean") return false;
  }
  if (v.confirmed !== null) {
    const c = v.confirmed;
    if (!isObj(c) || !isStr(c.at, 40) || !validInput(c.control) || !isObj(c.mapping)) return false;
    for (const f of FRAMEWORK_IDS) {
      const m = (c.mapping as Obj)[f];
      if (!isObj(m) || !validIds(m.ids, f, index) || !isRating(m.rating) || !isStr(m.rationale, 2000) || !isStr(m.naReason, 500)) return false;
      if (m.rating === "na" && !(m.naReason as string).trim()) return false;
    }
  }
  return (
    Array.isArray(v.history) &&
    v.history.length <= MAX_HISTORY &&
    v.history.every((h) => isObj(h) && isStr(h.at, 40) && EVENTS.includes(h.event as string) && isStr(h.detail, 200))
  );
}

/** Returns the workspace if the value passes every check, otherwise null. */
export function validateWorkspace(value: unknown, index: IdIndex): Workspace | null {
  if (!isObj(value) || value.version !== WORKSPACE_VERSION) return null;
  if (!Number.isInteger(value.nextAnalystNumber) || (value.nextAnalystNumber as number) < 1) return null;
  if (!Array.isArray(value.controls) || value.controls.length > MAX_CONTROLS) return null;
  if (!value.controls.every((r) => validRecord(r, index))) return null;
  const ids = value.controls.map((r) => (r as Obj).id);
  if (new Set(ids).size !== ids.length) return null;
  return value as Workspace;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Loads the tab's workspace. `discarded` is true when saved data existed but failed validation. */
export function loadWorkspace(storage: StorageLike | null, index: IdIndex): { ws: Workspace; discarded: boolean } {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return { ws: emptyWorkspace(), discarded: false };
  }
  if (raw === null) return { ws: emptyWorkspace(), discarded: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const ws = validateWorkspace(parsed, index);
  if (ws) return { ws, discarded: false };
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  return { ws: emptyWorkspace(), discarded: true };
}

/** Saves the workspace; returns false if the browser refused (private mode, quota). */
export function saveWorkspace(storage: StorageLike | null, ws: Workspace): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(ws));
    return Boolean(storage);
  } catch {
    return false;
  }
}
