/** Progress/usage colours, ported from upstream tools/progressColor.ts and tools/common.ts. */

/** Gradient stroke for antd Progress: >80% danger, >50% warning, else primary. */
export function getProgressStrokeColor(percent: number): { "0%": string; "100%": string } {
  if (percent > 80) return { "0%": "var(--color-danger)", "100%": "var(--color-danger)" };
  if (percent > 50) return { "0%": "var(--color-warning)", "100%": "var(--color-warning)" };
  return { "0%": "var(--color-primary)", "100%": "var(--color-primary)" };
}

/** Text colour for a usage percent: >=80 danger, >=60 warning, else `normalColor`. */
export const getUsageColor = (num: number, normalColor = "var(--color-primary)"): string =>
  num >= 80 ? "var(--color-danger)" : num >= 60 ? "var(--color-warning)" : normalColor;

/** True when major or minor differ (upstream tools/version.ts). */
export function hasVersionUpdate(oldVersion?: string, newVersion?: string): boolean {
  if (!oldVersion || !newVersion) return true;
  const [oMaj, oMin] = oldVersion.split(".");
  const [nMaj, nMin] = newVersion.split(".");
  return oMaj !== nMaj || oMin !== nMin;
}
