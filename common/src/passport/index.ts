/**
 * Panel <-> daemon passport authentication with two selectable modes:
 *  - "standard" (default): HMAC-SHA256 challenge-response over HKDF-derived
 *    keys from the panel and daemon secret pairs.
 *  - "johnnykins-legacy": the original Johnnykins wrapper and passport types,
 *    with the security fixes listed in legacy.ts.
 * Both are layered on top of upstream's daemon key check, never instead of it.
 */
export * as standardPassport from "./standard";
export * as legacyPassport from "./legacy";

export type PassportMode = "standard" | "johnnykins-legacy" | "off";
export const DEFAULT_PASSPORT_MODE: PassportMode = "standard";

/** Parse a config value, failing closed to the default for anything unknown (CWE-20). */
export function parsePassportMode(value: unknown): PassportMode {
  return value === "johnnykins-legacy" || value === "off" || value === "standard" ? value : DEFAULT_PASSPORT_MODE;
}
