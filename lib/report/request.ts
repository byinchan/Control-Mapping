// Validates a report-drafting request. The browser sends only confirmed results (no control descriptions, rationales
// or N/A reasons); the server rebuilds the facts pack from them with the same code. Names and owners are user text:
// they are capped, cleaned and only ever passed to the model as data.
import { FRAMEWORK_IDS } from "../catalog/types.ts";
import { INPUT_LIMITS } from "../mapping/config.ts";
import { UNSAFE_CHARS } from "../mapping/input.ts";
import { RATINGS, type Rating } from "../scoring/config.ts";
import { MAX_CONTROLS } from "../workflow/workspace.ts";
import type { FactsInput, FactsInputControl } from "./facts.ts";

export type ReportRequestResult = { ok: true; input: FactsInput } | { ok: false; error: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const CONTROL_ID = /^(C0(0[1-9]|1[0-4])|A\d{3})$/;

/** One line of plain text: unsafe characters removed and all whitespace (including newlines) collapsed. */
const oneLine = (v: string) => v.replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim();

function parseControl(v: unknown): FactsInputControl | string {
  if (!isObj(v)) return "Each control must be an object.";
  if (Object.keys(v).some((k) => !["id", "name", "owner", "ratings"].includes(k))) return "Unknown control field.";
  if (typeof v.id !== "string" || !CONTROL_ID.test(v.id)) return "Control ID is not valid.";
  if (typeof v.name !== "string") return "Control name is required.";
  const name = oneLine(v.name);
  if (!name || name.length > INPUT_LIMITS.name) return "Control name is missing or too long.";
  let owner: string | null = null;
  if (v.owner !== null && v.owner !== undefined) {
    if (typeof v.owner !== "string") return "Owner must be text.";
    owner = oneLine(v.owner) || null;
    if (owner && owner.length > INPUT_LIMITS.owner) return "Owner is too long.";
  }
  if (!isObj(v.ratings) || Object.keys(v.ratings).length !== FRAMEWORK_IDS.length) return "Each control needs one rating per framework.";
  const ratings = {} as Record<(typeof FRAMEWORK_IDS)[number], Rating>;
  for (const f of FRAMEWORK_IDS) {
    const r = v.ratings[f];
    if (!RATINGS.includes(r as Rating)) return "Rating is not valid.";
    ratings[f] = r as Rating;
  }
  return { id: v.id, name, owner, ratings };
}

/** Over-long or malformed requests are rejected, not trimmed: the app itself never sends them. */
export function parseReportRequest(body: unknown): ReportRequestResult {
  if (!isObj(body)) return { ok: false, error: "Request must be a JSON object." };
  if (Object.keys(body).some((k) => k !== "controls" && k !== "awaitingReview")) return { ok: false, error: "Unknown request field." };
  const { controls, awaitingReview } = body;
  if (!Array.isArray(controls) || controls.length === 0) return { ok: false, error: "Confirm at least one control first." };
  if (controls.length > MAX_CONTROLS) return { ok: false, error: "Too many controls." };
  if (!Number.isInteger(awaitingReview) || (awaitingReview as number) < 0 || (awaitingReview as number) > MAX_CONTROLS) {
    return { ok: false, error: "Awaiting-review count is not valid." };
  }
  const parsed: FactsInputControl[] = [];
  for (const c of controls) {
    const r = parseControl(c);
    if (typeof r === "string") return { ok: false, error: r };
    parsed.push(r);
  }
  if (new Set(parsed.map((c) => c.id)).size !== parsed.length) return { ok: false, error: "Control IDs must be unique." };
  if (parsed.length + (awaitingReview as number) > MAX_CONTROLS) return { ok: false, error: "Too many controls." };
  return { ok: true, input: { controls: parsed, awaitingReview: awaitingReview as number } };
}
