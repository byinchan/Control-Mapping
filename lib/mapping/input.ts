import { INPUT_LIMITS } from "./config.ts";
import type { ControlInput } from "./types.ts";

export type MapRequest = {
  control: ControlInput;
  /** Set when the analyst loaded a PUC sample control (C001-C014); used only for demo mode. */
  sampleId: string | null;
};

export type InputResult =
  | { ok: true; request: MapRequest; truncated: string[] }
  | { ok: false; error: string };

// Control characters other than tab/newline, and bidi overrides that can hide text.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

function clean(value: unknown, field: keyof typeof INPUT_LIMITS, truncated: string[]): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be text`);
  const text = value.replace(UNSAFE_CHARS, "").trim();
  if (text.length > INPUT_LIMITS[field]) {
    truncated.push(field);
    return text.slice(0, INPUT_LIMITS[field]).trimEnd();
  }
  return text || undefined;
}

/** Validates and caps a mapping request body. User text is only ever treated as data. */
export function parseMapRequest(body: unknown): InputResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "Request must be a JSON object." };
  const { control, sampleId } = body as Record<string, unknown>;
  if (typeof control !== "object" || control === null || Array.isArray(control)) {
    return { ok: false, error: "Exactly one control is required." };
  }
  const c = control as Record<string, unknown>;
  const allowed = new Set(Object.keys(INPUT_LIMITS));
  if (Object.keys(c).some((k) => !allowed.has(k))) return { ok: false, error: "Unknown control field." };

  const truncated: string[] = [];
  try {
    const name = clean(c.name, "name", truncated);
    const description = clean(c.description, "description", truncated);
    if (!name || !description) return { ok: false, error: "Control name and description are required." };
    const request: MapRequest = {
      control: {
        name,
        description,
        objective: clean(c.objective, "objective", truncated),
        activity: clean(c.activity, "activity", truncated),
        owner: clean(c.owner, "owner", truncated),
      },
      sampleId: typeof sampleId === "string" && /^C0(0[1-9]|1[0-4])$/.test(sampleId) ? sampleId : null,
    };
    return { ok: true, request, truncated };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
