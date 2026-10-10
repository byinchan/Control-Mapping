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
import type { MappingMode, MappingResponse } from "./types.ts";

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

export type ServiceResult = { status: number; body: MappingResponse | { error: string; requestId: string } };

// Generic, user-facing messages. Details of failures are never returned or logged.
export const MESSAGES = {
  rateLimited: "Too many mapping requests from your connection. Please wait a few minutes and try again.",
  unavailable:
    "AI mapping is unavailable right now. Demo mode can only show saved suggestions for the unchanged PUC sample controls.",
  invalidOutput: "The AI response could not be validated, so nothing was shown. Please try again.",
  demoNoKey: "Demo mode: no AI key is configured, so this is a saved suggestion for this sample control.",
  demoRateLimited: "Demo mode: your request limit was reached, so this is a saved suggestion for this sample control.",
  demoDailyCap: "Demo mode: today's AI call limit was reached, so this is a saved suggestion for this sample control.",
  demoUnavailable: "Demo mode: the AI service could not be reached, so this is a saved suggestion for this sample control.",
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
): ServiceResult {
  const parsed = parseRawProposal(rawOutput);
  if (!parsed.ok) return { status: 502, body: { error: MESSAGES.invalidOutput, requestId } };
  const { proposal, guardrails } = sanitizeProposal(parsed.proposal, deps.index, truncated);
  const allNotices = [...notices];
  const dropped = droppedIdsNotice(guardrails);
  if (dropped) allNotices.push(dropped);
  if (truncated.length) allNotices.push(`Input was shortened to the length limit: ${truncated.join(", ")}.`);
  return { status: 200, body: { requestId, mode, model, proposal, guardrails, notices: allNotices } };
}

function serveDemo(requestId: string, request: MapRequest, truncated: string[], deps: MappingDeps, notice: string, failStatus: number): ServiceResult {
  const saved = findDemoOutput(deps.demo, request.sampleId, request.control);
  if (saved === null) {
    const error = failStatus === 429 ? MESSAGES.rateLimited : MESSAGES.unavailable;
    return { status: failStatus, body: { error, requestId } };
  }
  const by = deps.demo.generatedBy;
  const notices = [notice];
  if (by.mapper === "mock") notices.push(MESSAGES.mock);
  return respond(requestId, "demo", by.model, saved, request, truncated, deps, notices);
}

/** Handles one mapping request: validate input, apply limits, choose mock/live/demo, validate output. */
export async function handleMapRequest(body: unknown, clientKey: string, requestId: string, deps: MappingDeps): Promise<ServiceResult> {
  const input = parseMapRequest(body);
  if (!input.ok) return { status: 400, body: { error: input.error, requestId } };
  const { request, truncated } = input;

  if (!deps.ipLimiter.check(clientKey)) return serveDemo(requestId, request, truncated, deps, MESSAGES.demoRateLimited, 429);

  if (deps.settings.mapper === "mock") {
    return respond(requestId, "mock", null, mockMap(request.control, deps.catalogs), request, truncated, deps, [MESSAGES.mock]);
  }

  if (!deps.settings.apiKeyPresent || !deps.liveMapper) return serveDemo(requestId, request, truncated, deps, MESSAGES.demoNoKey, 503);
  if (deps.now() < deps.state.liveCooldownUntil) return serveDemo(requestId, request, truncated, deps, MESSAGES.demoUnavailable, 503);
  if (!deps.dailyCap.tryConsume()) return serveDemo(requestId, request, truncated, deps, MESSAGES.demoDailyCap, 503);

  const result = await deps.liveMapper(request.control);
  if (!result.ok && result.kind === "unavailable") {
    deps.dailyCap.refund(); // the call did not go through, so it does not count against today's cap
    if (result.cooldown) deps.state.liveCooldownUntil = deps.now() + LIVE_COOLDOWN_MS;
    return serveDemo(requestId, request, truncated, deps, MESSAGES.demoUnavailable, 503);
  }
  if (!result.ok) return { status: 502, body: { error: MESSAGES.invalidOutput, requestId } };
  return respond(requestId, "live", deps.settings.model, result.output, request, truncated, deps, []);
}
