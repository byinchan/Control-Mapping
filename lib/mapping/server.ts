// Server-side wiring for the mapping route: one set of limiters and one client per server instance.
// Never import this module from client components.
import demo from "../../data/demo-mappings.json" with { type: "json" };
import { CATALOGS, ID_INDEX } from "../catalog/catalogs.ts";
import { DailyCap, SlidingWindowLimiter } from "../guard/rateLimit.ts";
import { createLiveMapper } from "./anthropic.ts";
import { readSettings } from "./config.ts";
import type { DemoFile } from "./demo.ts";
import { buildSystemPrompt } from "./prompt.ts";
import type { MappingDeps } from "./service.ts";

let deps: MappingDeps | null = null;

export function getMappingDeps(): MappingDeps {
  if (deps) return deps;
  const settings = readSettings(process.env);
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  deps = {
    settings,
    catalogs: CATALOGS,
    index: ID_INDEX,
    demo: demo as DemoFile,
    liveMapper: settings.mapper === "live" && apiKey ? createLiveMapper(apiKey, settings.model, buildSystemPrompt(CATALOGS)) : null,
    ipLimiter: new SlidingWindowLimiter(settings.perIpRequests, settings.perIpWindowMs),
    dailyCap: new DailyCap(settings.dailyLiveCalls),
    state: { liveCooldownUntil: 0 },
    now: Date.now,
  };
  return deps;
}
