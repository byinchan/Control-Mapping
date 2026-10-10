import { createHash, randomBytes, randomUUID } from "node:crypto";
import { MAX_BODY_BYTES } from "@/lib/mapping/config.ts";
import { getMappingDeps } from "@/lib/mapping/server.ts";
import { handleMapRequest } from "@/lib/mapping/service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Client IPs are only kept as salted hashes in memory, for rate limiting.
const SALT = randomBytes(16).toString("hex");
const clientKey = (req: Request) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(SALT + ip).digest("hex");
};

function reply(requestId: string, status: number, body: unknown) {
  // Log only the request id and status. Never log control text or model output.
  console.info(JSON.stringify({ route: "api/map", requestId, status }));
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

export async function POST(req: Request) {
  const requestId = randomUUID();
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return reply(requestId, 415, { error: "Send the control as JSON.", requestId });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return reply(requestId, 413, { error: "Request is too large.", requestId });
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return reply(requestId, 413, { error: "Request is too large.", requestId });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(requestId, 400, { error: "Request is not valid JSON.", requestId });
  }

  try {
    const result = await handleMapRequest(body, clientKey(req), requestId, getMappingDeps());
    return reply(requestId, result.status, result.body);
  } catch {
    return reply(requestId, 500, { error: "Something went wrong. Please try again.", requestId });
  }
}
