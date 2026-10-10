// Live mapper: the only module that talks to the Claude API. Server-side only; never import it
// from client components. The API key is read by the SDK from the server environment.
import Anthropic from "@anthropic-ai/sdk";
import { buildUserMessage } from "./prompt.ts";
import { PROPOSAL_SCHEMA } from "./schema.ts";
import type { ControlInput } from "./types.ts";

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

export type LiveResult =
  | { ok: true; output: unknown; usage: Usage }
  /** The API could not be used (no credit, bad key, rate limit, outage). `cooldown` = stop calling for a while. */
  | { ok: false; kind: "unavailable"; cooldown: boolean }
  /** The API answered but the answer is unusable (refusal, cut off, not JSON). */
  | { ok: false; kind: "invalid-output" };

export type LiveMapper = (control: ControlInput) => Promise<LiveResult>;

export function createLiveMapper(apiKey: string, model: string, systemPrompt: string): LiveMapper {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 45_000 });

  return async (control) => {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 4000,
        // The system prompt (rules + catalogs) is identical on every call, so cache it.
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildUserMessage(control) }],
        output_config: { effort: "low", format: { type: "json_schema", schema: PROPOSAL_SCHEMA } },
      });
    } catch (error) {
      // Most specific first. Error details are never logged or returned: they can echo request content.
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        return { ok: false, kind: "unavailable", cooldown: true };
      }
      if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
        return { ok: false, kind: "unavailable", cooldown: false };
      }
      if (error instanceof Anthropic.APIConnectionError) return { ok: false, kind: "unavailable", cooldown: false };
      if (error instanceof Anthropic.APIError) {
        // 402 billing_error (no credit left) has no dedicated class in this SDK version.
        return { ok: false, kind: "unavailable", cooldown: error.status === 402 };
      }
      throw error;
    }

    if (response.stop_reason !== "end_turn") return { ok: false, kind: "invalid-output" };
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    if (!text) return { ok: false, kind: "invalid-output" };
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      return { ok: false, kind: "invalid-output" };
    }
    return {
      ok: true,
      output,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    };
  };
}
