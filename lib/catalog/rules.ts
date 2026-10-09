import type { FrameworkId } from "./types.ts";

// Hard-coded here, not read from the catalog files, so a catalog cannot certify its own size.
export const EXPECTED_COUNTS: Record<FrameworkId, number> = {
  "nist-csf-2.0": 106,
  "iso-27001-2022": 93,
  "cis-v8.1": 153,
  "soc2-tsc-2017": 61,
};

export const ID_PATTERNS: Record<FrameworkId, RegExp> = {
  "nist-csf-2.0": /^(GV|ID|PR|DE|RS|RC)\.[A-Z]{2}-\d{2}$/,
  "iso-27001-2022": /^A\.[5-8]\.\d{1,2}$/,
  "cis-v8.1": /^([1-9]|1[0-8])\.\d{1,2}$/,
  "soc2-tsc-2017": /^(CC[1-9]\.\d|A1\.\d|C1\.\d|PI1\.\d|P[1-8]\.\d)$/,
};

// Own labels must stay short so no framework text can be pasted in; NIST text is public domain.
export const MAX_LABEL_LENGTH = { "own-label": 80, "official-text": 300 } as const;

// CIS v8.1 safeguards per control, as printed in the CIS PDF ("Safeguards: N").
export const CIS_SAFEGUARDS_PER_CONTROL = [5, 7, 14, 12, 6, 8, 7, 12, 7, 7, 5, 8, 11, 9, 7, 14, 9, 5];

// ISO/IEC 27001:2022 Annex A controls per theme (A.5, A.6, A.7, A.8).
export const ISO_CONTROLS_PER_THEME: Record<string, number> = { "A.5": 37, "A.6": 8, "A.7": 14, "A.8": 34 };
