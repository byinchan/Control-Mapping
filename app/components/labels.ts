// Button labels used in more than one place (buttons, helper text, notices). Change them only here.
export const AI_LABELS = {
  /** Batch button on the review screen. */
  mapAll: "Ask AI to map controls",
  /** Single control without an AI suggestion yet. */
  mapOne: "Ask AI to map this control",
  /** Single control that already has an AI suggestion. */
  replace: "Replace with a new AI suggestion",
} as const;

/** Confirm bar on the review screen. */
export const CONFIRM_LABELS = {
  confirm: "Confirm this control",
  confirmAndNext: "Confirm and go to next control",
  /** Left-hand text in the bar, e.g. "C005: confirming records your decision". */
  barText: (controlId: string) => `${controlId}: confirming records your decision`,
  /** Shown when every control is confirmed. */
  continueToMatrix: "Continue to matrix & gaps",
} as const;
