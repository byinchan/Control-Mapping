import type { ControlInput } from "./types.ts";

/** Saved mapper outputs for the 14 PUC sample controls (data/demo-mappings.json). */
export type DemoFile = {
  generatedBy: { mapper: "live" | "mock"; model: string | null; generatedAt: string; note: string };
  controls: Record<string, { input: ControlInput; output: unknown }>;
};

const same = (a: string | undefined, b: string | undefined) => (a ?? "") === (b ?? "");

/**
 * Returns the saved output for a sample control, but only if the analyst has not changed its
 * text: a saved answer for different text would be misleading.
 */
export function findDemoOutput(demo: DemoFile, sampleId: string | null, control: ControlInput): unknown | null {
  if (!sampleId) return null;
  const entry = demo.controls[sampleId];
  if (!entry) return null;
  const i = entry.input;
  const unchanged =
    same(i.name, control.name) &&
    same(i.description, control.description) &&
    same(i.objective, control.objective) &&
    same(i.activity, control.activity) &&
    same(i.owner, control.owner);
  return unchanged ? entry.output : null;
}
