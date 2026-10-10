import type { FrameworkId } from "./types.ts";

/** Display names for messages and screens. Internal IDs such as "cis-v8.1" are never shown to people. */
export const FRAMEWORK_NAMES: Record<FrameworkId, string> = {
  "nist-csf-2.0": "NIST CSF 2.0",
  "iso-27001-2022": "ISO/IEC 27001:2022",
  "cis-v8.1": "CIS Controls v8.1",
  "soc2-tsc-2017": "SOC 2 TSC",
};
