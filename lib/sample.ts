import { FRAMEWORK_IDS, type FrameworkId } from "./catalog/types.ts";
import type { V1Cell } from "./catalog/v1.ts";

export type V1Control = {
  id: string;
  name: string;
  objective: string;
  activity: string;
  owner: string;
  v1Status: string;
  frameworks: Record<FrameworkId, { raw: string; parsed: V1Cell }>;
};

export type SampleCorrection = {
  control: string;
  framework: FrameworkId;
  v1: string[];
  corrected: string[];
  reason: string;
  approvedBy: string;
  approved: string;
};

export type SampleControl = Omit<V1Control, "frameworks"> & {
  frameworks: Record<FrameworkId, V1Cell & { correctedFrom?: string[] }>;
  correctedFrameworks: FrameworkId[];
};

/**
 * Builds the PUC sample from the v1 transcription plus approved corrections.
 * Throws if a correction no longer matches the v1 IDs it claims to replace.
 */
export function applySampleCorrections(
  v1: readonly V1Control[],
  corrections: readonly SampleCorrection[],
): SampleControl[] {
  const seen = new Set<string>();
  for (const c of corrections) {
    const key = `${c.control}/${c.framework}`;
    if (seen.has(key)) throw new Error(`Duplicate correction for ${key}`);
    seen.add(key);
    const control = v1.find((x) => x.id === c.control);
    if (!control) throw new Error(`Correction for unknown control ${c.control}`);
    const parsed = control.frameworks[c.framework].parsed;
    if (parsed.kind !== "ids" || JSON.stringify(parsed.ids) !== JSON.stringify(c.v1)) {
      throw new Error(`Correction ${key} does not match the v1 IDs`);
    }
    if (c.corrected.length === 0) throw new Error(`Correction ${key} has no corrected IDs`);
  }

  return v1.map((control) => {
    const correctedFrameworks: FrameworkId[] = [];
    const frameworks = Object.fromEntries(
      FRAMEWORK_IDS.map((f) => {
        const fix = corrections.find((c) => c.control === control.id && c.framework === f);
        if (!fix) return [f, control.frameworks[f].parsed];
        correctedFrameworks.push(f);
        return [f, { kind: "ids", ids: [...fix.corrected], correctedFrom: [...fix.v1] }];
      }),
    ) as SampleControl["frameworks"];
    const { frameworks: _, ...rest } = control;
    return { ...rest, frameworks, correctedFrameworks };
  });
}
