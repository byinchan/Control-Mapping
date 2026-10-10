import type { ControlInput, DemoReason, MappingResponse } from "@/lib/mapping/types.ts";
import type { ErrorCode } from "@/lib/mapping/service.ts";
import type { AiRecord, ControlRecord } from "@/lib/workflow/workspace.ts";

export type MappingOutcome =
  | { ok: true; ai: AiRecord; demoReason: DemoReason | null }
  | { ok: false; error: string; code: ErrorCode | "network" };

/** Sends one control to the server route. The API key never reaches the browser. */
export async function requestMapping(record: ControlRecord): Promise<MappingOutcome> {
  const control = Object.fromEntries(
    Object.entries(record.current).filter(([, v]) => typeof v === "string" && v.trim()),
  ) as ControlInput;
  try {
    const res = await fetch("/api/map", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ control, sampleId: record.sampleId }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || "error" in body) {
      const message = body && typeof body.error === "string" ? body.error : "The mapping service did not respond. Please try again.";
      const code: ErrorCode = body && typeof body.code === "string" ? body.code : "unavailable";
      return { ok: false, code, error: body?.requestId ? `${message} (request ${String(body.requestId).slice(0, 8)})` : message };
    }
    const r = body as MappingResponse;
    return {
      ok: true,
      demoReason: r.demoReason,
      ai: {
        requestId: r.requestId,
        mode: r.mode,
        model: r.model,
        receivedAt: new Date().toISOString(),
        input: { ...record.current },
        proposal: r.proposal,
        guardrails: r.guardrails,
        notices: r.notices,
      },
    };
  } catch {
    return { ok: false, code: "network", error: "Could not reach the mapping service. Check your connection and try again." };
  }
}
