import { RATINGS } from "../scoring/config.ts";
import { OUTPUT_KEYS, type OutputKey, type RawProposal } from "./types.ts";

const frameworkSchema = {
  type: "object",
  properties: {
    ids: { type: "array", items: { type: "string" } },
    rating: { type: "string", enum: [...RATINGS] },
    rationale: { type: "string" },
    na_reason: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["ids", "rating", "rationale", "na_reason"],
  additionalProperties: false,
} as const;

/**
 * JSON schema for the model's structured output (output_config.format).
 * IDs are plain strings on purpose: the prompt lists the catalogs, and the server
 * re-validates every ID and reports the ones it removes.
 */
export const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    frameworks: {
      type: "object",
      properties: Object.fromEntries(Object.keys(OUTPUT_KEYS).map((k) => [k, frameworkSchema])),
      required: Object.keys(OUTPUT_KEYS),
      additionalProperties: false,
    },
    uncertainties: { type: "array", items: { type: "string" } },
    missing_information: { type: "array", items: { type: "string" } },
  },
  required: ["frameworks", "uncertainties", "missing_information"],
  additionalProperties: false,
} as const;

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Runtime check of model output against PROPOSAL_SCHEMA. Structured outputs should guarantee
 * this shape, but the response is still treated as untrusted: anything else is rejected.
 */
export function parseRawProposal(value: unknown): { ok: true; proposal: RawProposal } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (typeof value !== "object" || value === null) return fail("output is not an object");
  const v = value as Record<string, unknown>;
  if (!isStringArray(v.uncertainties) || !isStringArray(v.missing_information)) return fail("lists must be string arrays");
  if (typeof v.frameworks !== "object" || v.frameworks === null) return fail("frameworks missing");
  const fws = v.frameworks as Record<string, unknown>;
  for (const key of Object.keys(OUTPUT_KEYS) as OutputKey[]) {
    const f = fws[key] as Record<string, unknown> | undefined;
    if (!f || typeof f !== "object") return fail(`${key} missing`);
    if (!isStringArray(f.ids)) return fail(`${key}.ids invalid`);
    if (!RATINGS.includes(f.rating as never)) return fail(`${key}.rating invalid`);
    if (typeof f.rationale !== "string") return fail(`${key}.rationale invalid`);
    if (f.na_reason !== null && typeof f.na_reason !== "string") return fail(`${key}.na_reason invalid`);
  }
  return { ok: true, proposal: value as RawProposal };
}
