/**
 * Passport "johnnykins-legacy" mode: the original algorithm from the
 * Johnnykins-MCSManager fork (panel 10.2.1 / daemon 4.4.1, Sept 2024) by
 * Johnathan Edward Brown, kept intact where it is the design and fixed where
 * the original implementation was exploitable.
 *
 * Kept as designed:
 * - JohnsNonAsymmSha256Wrapper: three HMAC-SHA256 links over two
 *   password/salt pairs, entropy-multiplier doubling (capped at 10), and the
 *   three seeded scramble layers (seedrandom ARC4).
 * - tokenV2 (6 parts) / tokenV3 (9 parts) passport tokens with an entropy
 *   multiplier, and the SymbolTokenGenerator Unicode alphabet.
 * - Passport types 1-4 and their type guards.
 *
 * Fixed (see docs/SECURITY-LOG.md, 2026-10-25):
 * - verify used `token.match(expected)` / `String(obj.key).match(header)`.
 *   With an attacker-supplied pattern such as ".*" this accepted any token
 *   (CWE-185 incorrect regex, CWE-287 auth bypass) and allowed ReDoS
 *   (CWE-1333). Now: exact-length crypto.timingSafeEqual (CWE-208).
 * - Entropy multiplier and symbol shuffles used Math.random (CWE-338). Now:
 *   crypto.randomInt, which is also free of modulo bias.
 * - randomBytes(n).toString("utf8") replaced invalid bytes with U+FFFD,
 *   discarding most entropy (CWE-331). Now: base64url.
 * - Errors were created but not thrown (`new Error(...)` without throw),
 *   leaving an undefined token that stringified to "" (CWE-391). Now thrown.
 *
 * SECURITY-WARNING: the scramble layers are a deterministic permutation keyed
 * by the same secrets as the HMACs. They add no cryptographic strength beyond
 * HMAC-SHA256 and are not a NIST-approved construction; seedrandom is not a
 * CSPRNG (it is used here only as a keyed, reproducible shuffle). Prefer the
 * "standard" mode where FIPS 140-3 / NIST SC-13 compliance matters.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import seedrandom from "seedrandom";

const MAX_INPUT_BYTES = 1024;

/** HMAC-SHA256(salt as key, value) as hex (original generateToken). */
export function generateToken(value: string, salt: string): string {
  return createHmac("sha256", salt).update(value).digest("hex");
}

function scrambleString(input: string, seed: string): string {
  const rng = seedrandom(seed);
  const chars = input.split("");
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/**
 * The original dual-key SHA-256 wrapper.
 * @param multiplier entropy multiplier 1-10 (values >= 11 are capped at 10)
 * @throws Error if the input exceeds 1024 bytes (fails closed, CWE-400)
 */
export class JohnsNonAsymmSha256Wrapper {
  private readonly token: string;

  constructor(data: string, password: string, salt: string, password2: string, salt2: string, multiplier?: number) {
    const first = generateToken(data + password, salt);
    const raw = first + generateToken(first + password2, salt2) + generateToken(data + password2, salt2);
    if (Buffer.byteLength(raw) >= MAX_INPUT_BYTES) throw new Error("Unsafe Buffer Size!");

    let entropy = 1;
    if (multiplier !== undefined) entropy = multiplier >= 11 ? 10 : multiplier >= 1 ? Math.floor(multiplier) : 1;

    let token = Buffer.from(raw).toString("hex");
    const placeholder = token;
    for (let i = 0; i <= entropy; i++) token = token + token;
    token = scrambleString(token, password + salt);
    const placeholder2 = token;
    token = scrambleString(token, password2 + salt2);
    token = scrambleString(token, scrambleString(placeholder2, placeholder));
    this.token = token;
  }

  toString(): string {
    return Buffer.from(this.token).toString("hex");
  }
}

/**
 * Verify a wrapper token. Fixed: exact constant-time comparison instead of
 * the original `token.match(expected)` (CWE-185/CWE-287/CWE-208).
 */
export function verifyJohnsAsymmSha256Wrapper(
  token: string, data: string, password: string, salt: string, password2: string, salt2: string, multiplier?: number
): boolean {
  if (typeof token !== "string" || token.length === 0) return false;
  try {
    const expected = Buffer.from(new JohnsNonAsymmSha256Wrapper(data, password, salt, password2, salt2, multiplier).toString());
    const given = Buffer.from(token);
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

/** Constant-time string equality for passport fields (replaces .match()). */
export function safeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Original Unicode symbol alphabet (no emoji), shuffled with a CSPRNG. */
export class SymbolTokenGenerator {
  private readonly symbols: string[];
  constructor() {
    const isEmoji = (c: number) =>
      (c >= 0x1f300 && c <= 0x1f5ff) || (c >= 0x1f600 && c <= 0x1f64f) || (c >= 0x1f680 && c <= 0x1f6ff) || (c >= 0x1f900 && c <= 0x1f9ff);
    const s: string[] = [];
    for (let i = 0x0020; i <= 0x2fff; i++) if (!isEmoji(i)) s.push(String.fromCodePoint(i));
    for (let i = 0x13000; i <= 0x1342f; i++) s.push(String.fromCodePoint(i));
    for (let i = 0x2200; i <= 0x26ff; i++) if (!isEmoji(i)) s.push(String.fromCodePoint(i));
    this.symbols = s;
  }
  /** Random string of min..max symbols. Fixed: randomInt (no Math.random, no modulo bias). */
  generateRandomWithEntropy(min: number, max: number): string {
    const length = randomInt(min, max + 1);
    let out = "";
    for (let i = 0; i < length; i++) out += this.symbols[randomInt(0, this.symbols.length)];
    return out;
  }
}

const symbolGen = new SymbolTokenGenerator();

/** Random entropy multiplier in [1, max], max capped at 10. Fixed: CSPRNG. */
export function createTokenEntropy(max = 3): number {
  const cap = Math.min(Math.max(1, Math.floor(max)), 10);
  return randomInt(1, cap + 1);
}

function part(bytes: number): string {
  // Fixed: base64url keeps every random byte (utf8 decoding discarded most).
  return randomBytes(bytes).toString("base64url") + symbolGen.generateRandomWithEntropy(1, 3);
}

/** 6-part token (original tokenV2). */
export function createTokenV2(entropy = 1): string {
  const t = { d1: part(5 * entropy), d2: part(5 * entropy), d3: part(5 * entropy), d4: part(5 * entropy), d5: part(5 * entropy), d6: part(5 * entropy) };
  return Buffer.from(JSON.stringify(t)).toString("hex");
}

/** 9-part token (original tokenV3). */
export function createTokenV3(entropy = 1): string {
  const t: Record<string, string> = {};
  for (let i = 1; i <= 9; i++) t[`c${i}`] = part(3 * entropy);
  return Buffer.from(JSON.stringify(t)).toString("hex");
}

/** Passport shapes from the original fork (types 1-4). */
export interface PassportV1 { key: string; token: string; uuid: string; entropy?: number }
export interface PassportV2 { key: string; tokenv2: string; uuid: string; entropy?: number }
export interface PassportV3 { key: string; tokenv2: string; tokenv3: string; uuid: string; entropy?: number }
export interface PassportV4 { key: string; token: string; tokenv2: string; tokenv3: string; uuid: string; entropy?: number }
export type LegacyPassport = PassportV1 | PassportV2 | PassportV3 | PassportV4;
export type LegacyPassportType = 1 | 2 | 3 | 4;

const FIELDS: Record<LegacyPassportType, string[]> = {
  1: ["key", "token", "uuid"],
  2: ["key", "tokenv2", "uuid"],
  3: ["key", "tokenv2", "tokenv3", "uuid"],
  4: ["key", "token", "tokenv2", "tokenv3", "uuid"]
};

/** Type guard covering isPassportv1..v4 (and the WithEntropy variants). */
export function isLegacyPassport(obj: unknown, type: LegacyPassportType): obj is LegacyPassport {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (o.entropy !== undefined && typeof o.entropy !== "number") return false;
  return FIELDS[type].every((f) => typeof o[f] === "string" && (o[f] as string).length > 0 && (o[f] as string).length <= 8192);
}

/**
 * Compare a stored passport with the fields a peer presented, all in
 * constant time. Replaces the regex comparison in the original
 * /api/auth/daemon-verifications handler.
 */
export function matchLegacyPassport(stored: LegacyPassport, presented: Record<string, unknown>, type: LegacyPassportType): boolean {
  if (!isLegacyPassport(stored, type)) return false;
  // Evaluate every field (no short-circuit) so timing doesn't reveal which one differed.
  let ok = true;
  for (const f of FIELDS[type]) ok = safeEqual((stored as unknown as Record<string, string>)[f], presented[f]) && ok;
  return ok;
}
