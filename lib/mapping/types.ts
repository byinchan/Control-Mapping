import type { FrameworkId } from "../catalog/types.ts";
import type { Rating } from "../scoring/config.ts";

/** Control text entered by the analyst (after caps). */
export type ControlInput = {
  name: string;
  description: string;
  objective?: string;
  activity?: string;
  owner?: string;
};

/** Short framework keys used in the model's JSON output. */
export const OUTPUT_KEYS = { nist: "nist-csf-2.0", iso: "iso-27001-2022", cis: "cis-v8.1", soc2: "soc2-tsc-2017" } as const;
export type OutputKey = keyof typeof OUTPUT_KEYS;

/** What the model (or mock) returns, before validation. */
export type RawFrameworkProposal = {
  ids: string[];
  rating: Rating;
  rationale: string;
  na_reason: string | null;
};

export type RawProposal = {
  frameworks: Record<OutputKey, RawFrameworkProposal>;
  uncertainties: string[];
  missing_information: string[];
};

/** A validated AI proposal: only catalog IDs, capped text. Advisory until the analyst confirms. */
export type FrameworkProposal = {
  ids: string[];
  rating: Rating;
  rationale: string;
  naReason: string | null;
};

export type Proposal = {
  frameworks: Record<FrameworkId, FrameworkProposal>;
  uncertainties: string[];
  missingInformation: string[];
};

export type Guardrails = {
  /** Suggested IDs that were not in the catalog and were removed. */
  droppedIds: { framework: FrameworkId; id: string }[];
  /** Input fields that were cut to the length cap. */
  truncatedInput: string[];
  /** Output fields that were cut to the length cap. */
  truncatedOutput: string[];
  /** Other things the analyst must check (e.g. a rating with no IDs left). */
  warnings: string[];
};

export type MappingMode = "live" | "mock" | "demo";

export type MappingResponse = {
  requestId: string;
  mode: MappingMode;
  /** Model name for live and demo output; null for the mock mapper. */
  model: string | null;
  proposal: Proposal;
  guardrails: Guardrails;
  /** Plain-language notices, e.g. why demo mode is active. */
  notices: string[];
};
