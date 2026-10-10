import v1 from "../../data/v1-controls.json" with { type: "json" };
import { sampleIntake, type V1Control } from "../sample.ts";

/** The 14 PUC sample controls (C001-C014) as "Load PUC sample" adds them: text only, no mappings. */
export const PUC_SAMPLES = (v1.controls as V1Control[]).map((c) => ({ id: c.id, input: sampleIntake(c) }));
