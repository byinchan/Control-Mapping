// All AI mapping limits and settings in one place. Server-side only; nothing here is secret.

export const DEFAULT_MODEL = "claude-haiku-5-5";

/** Caps on analyst input. Longer text is truncated and the analyst is told which fields. */
export const INPUT_LIMITS = {
  name: 120,
  description: 1500,
  objective: 500,
  activity: 800,
  owner: 80,
} as const;

/** Maximum request body size in bytes; larger bodies are rejected before parsing. */
export const MAX_BODY_BYTES = 16_384;

/** Caps on model output, applied after ID validation. */
export const OUTPUT_LIMITS = {
  idsPerFramework: 12,
  rationale: 300,
  naReason: 200,
  listItems: 5,
  listItemLength: 200,
} as const;

/** Per-IP sliding window and app-wide daily cap on live model calls. */
export const DEFAULT_LIMITS = {
  perIpRequests: 20,
  perIpWindowMs: 10 * 60 * 1000,
  dailyLiveCalls: 300,
} as const;

/** After a billing or authentication failure, stop calling the API for this long. */
export const LIVE_COOLDOWN_MS = 10 * 60 * 1000;

export type MapperKind = "live" | "mock";

export type MappingSettings = {
  mapper: MapperKind;
  model: string;
  apiKeyPresent: boolean;
  perIpRequests: number;
  perIpWindowMs: number;
  dailyLiveCalls: number;
};

const positiveInt = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Reads settings from the environment. The API key itself is never returned. */
export function readSettings(env: Record<string, string | undefined>): MappingSettings {
  return {
    mapper: env.MAPPER === "mock" ? "mock" : "live",
    model: env.MAPPING_MODEL?.trim() || DEFAULT_MODEL,
    apiKeyPresent: Boolean(env.ANTHROPIC_API_KEY?.trim()),
    perIpRequests: positiveInt(env.MAPPING_RATE_LIMIT_PER_IP, DEFAULT_LIMITS.perIpRequests),
    perIpWindowMs: DEFAULT_LIMITS.perIpWindowMs,
    dailyLiveCalls: positiveInt(env.MAPPING_DAILY_CALL_CAP, DEFAULT_LIMITS.dailyLiveCalls),
  };
}
