import type { IdIndex } from "../catalog/ids.ts";
import type { Catalog } from "../catalog/types.ts";
import type { DailyCap, SlidingWindowLimiter } from "../guard/rateLimit.ts";
import type { LiveMapper } from "./anthropic.ts";
import { LIVE_COOLDOWN_MS, type MappingSettings } from "./config.ts";
import { findDemoOutput, type DemoFile } from "./demo.ts";
import { parseMapRequest, type MapRequest } from "./input.ts";
import { mockMap } from "./mock.ts";
import { droppedIdsNotice, sanitizeProposal } from "./sanitize.ts";
import { parseRawProposal } from "./schema.ts";
import type { DemoReason, MappingMode, MappingResponse } from "./types.ts";

export type MappingDeps = {
  settings: MappingSettings;
  catalogs: readonly Catalog[];
  index: IdIndex;
  demo: DemoFile;
  liveMapper: LiveMapper | null;
  ipLimiter: SlidingWindowLimiter;
  dailyCap: DailyCap;
  /** Shared mutable state: live calls are paused until this time after a billing/auth failure. */
  state: { liveCooldownUntil: number };
  now: () => number;
};

/** Why a request was not answered by the live model. Lets the browser explain it in plain words. */
export type ErrorCode = "bad-request" | "rate-limited" | "unavailable" | "invalid-output";
export type ErrorBody = { error: string; requestId: string; code: ErrorCode };

export type ServiceResult = { status: number; body: MappingResponse | ErrorBody };

// Generic, user-facing messages. Details of failures are never returned or logged.
export const MESSAGES = {
  unavailable:
    "AI mapping is unavailable right now. Demo mode can only show saved suggestions for the unchanged PUC sample controls.",
  invalidOutput: "The AI response could not be validated, so nothing was shown. Please try again.",
  mock: "Mock mapper: suggestions come from keyword overlap, not from an AI model.",
} as const;

function respond(
  requestId: string,
  mode: MappingMode,
  model: string | null,
  rawOutput: unknown,
  request: MapRequest,
  truncated: string[],
  deps: MappingDeps,
  notices: string[],
  demoReason: DemoReason | null = null,
): ServiceResult {
  const parsed = parseRawProposal(rawOutput);
  if (!parsed.ok) return { status: 502, body: { error: MESSAGES.invalidOutput, requestId, code: "invalid-output" } };
  const { proposal, guardrails } = sanitizeProposal(parsed.proposal, deps.index, truncated);
  const allNotices = [...notices];
  const dropped = droppedIdsNotice(guardrails);
  if (dropped) allNotices.push(dropped);
  if (truncated.length) allNotices.push(`Input was shortened to the length limit: ${truncated.join(", ")}.`);
  return { status: 200, body: { requestId, mode, model, demoReason, proposal, guardrails, notices: allNotices } };
}

/** Friendly limit message built from the actual settings. */
export const rateLimitedMessage = (s: MappingSettings) =>
  `You have reached the limit of AI suggestions for now (${s.perIpRequests} every ${Math.round(s.perIpWindowMs / 60000)} minutes per visitor). Please wait a few minutes and try again, or map this control by hand.`;

// Why demo mode answered, added to the one demo notice. Public text never says how the server is configured,
// so the missing-key case gives no reason.
const DEMO_REASON: Record<DemoReason, string> = {
  "no-key": "",
  "rate-limited": " Shown because your AI suggestion limit was reached.",
  "daily-cap": " Shown because today's AI call limit was reached.",
  unavailable: " Shown because the AI service could not be reached.",
};

/** The single notice for a demo answer: what is shown, where it came from (model, date, prompt version) and its label. */
export function demoNotice(by: DemoFile["generatedBy"], reason: DemoReason): string {
  const what = by.mapper === "mock" ? "saved mock-mapper suggestion (keyword overlap, not AI)" : "saved AI suggestion";
  // "v2 (2026-10-10)" -> "v2": the date is already given.
  const prompt = by.promptVersion?.replace(/\s*\(.*\)$/, "");
  const source = [by.model, by.generatedAt, prompt ? `prompt ${prompt}` : null].filter(Boolean).join(", ");
  return `Demo mode: showing a ${what} for this sample control (${source}). ${by.label}.${DEMO_REASON[reason]}`;
}

function serveDemo(requestId: string, request: MapRequest, truncated: string[], deps: MappingDeps, reason: DemoReason): ServiceResult {
  const saved = findDemoOutput(deps.demo, request.sampleId, request.control);
  if (saved === null) {
    return reason === "rate-limited"
      ? { status: 429, body: { error: rateLimitedMessage(deps.settings), requestId, code: "rate-limited" } }
      : { status: 503, body: { error: MESSAGES.unavailable, requestId, code: "unavailable" } };
  }
  return respond(requestId, "demo", deps.demo.generatedBy.model, saved, request, truncated, deps, [demoNotice(deps.demo.generatedBy, reason)], reason);
}

/** Handles one mapping request: validate input, apply limits, choose mock/live/demo, validate output. */
export async function handleMapRequest(body: unknown, clientKey: string, requestId: string, deps: MappingDeps): Promise<ServiceResult> {
  const input = parseMapRequest(body);
  if (!input.ok) return { status: 400, body: { error: input.error, requestId, code: "bad-request" } };
  const { request, truncated } = input;

  if (!deps.ipLimiter.check(clientKey)) return serveDemo(requestId, request, truncated, deps, "rate-limited");

  if (deps.settings.mapper === "mock") {
    return respond(requestId, "mock", null, mockMap(request.control, deps.catalogs), request, truncated, deps, [MESSAGES.mock]);
  }

  if (!deps.settings.apiKeyPresent || !deps.liveMapper) return serveDemo(requestId, request, truncated, deps, "no-key");
  if (deps.now() < deps.state.liveCooldownUntil) return serveDemo(requestId, request, truncated, deps, "unavailable");
  if (!deps.dailyCap.tryConsume()) return serveDemo(requestId, request, truncated, deps, "daily-cap");

  const result = await deps.liveMapper(request.control);
  if (!result.ok && result.kind === "unavailable") {
    deps.dailyCap.refund(); // the call did not go through, so it does not count against today's cap
    if (result.cooldown) deps.state.liveCooldownUntil = deps.now() + LIVE_COOLDOWN_MS;
    return serveDemo(requestId, request, truncated, deps, "unavailable");
  }
  if (!result.ok) return { status: 502, body: { error: MESSAGES.invalidOutput, requestId, code: "invalid-output" } };
  return respond(requestId, "live", deps.settings.model, result.output, request, truncated, deps, []);
}
