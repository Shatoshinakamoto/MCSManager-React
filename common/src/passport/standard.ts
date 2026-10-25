/**
 * Passport "standard" mode: panel <-> daemon mutual authentication that keeps
 * the design of the Johnnykins passport (two secret/salt pairs, one owned by
 * the panel and one by the daemon, both required to prove a session) but is
 * built only on vetted primitives.
 *
 * Flow (challenge-response, NIST SP 800-63B §5.1.3 style "proof of possession"):
 *   1. daemon -> panel: daemonNonce (random, 256-bit)
 *   2. panel  -> daemon: panelNonce + proof = HMAC(K, transcript)
 *   3. daemon verifies proof with constant-time compare, then replies with its
 *      own proof over the same transcript so the panel can verify the daemon.
 *   K = HKDF-SHA256(ikm = panelSecret || daemonSecret, salt = panelSalt || daemonSalt)
 *   transcript = "mcsm-passport-v1" | role | panelId | daemonId | nonces | timestamp
 *
 * Security controls:
 * - HMAC-SHA256 and HKDF from node:crypto (FIPS 140-3 capable OpenSSL; NIST SC-13).
 * - Nonces and secrets from crypto.randomBytes (CSPRNG; CWE-330/CWE-338).
 * - crypto.timingSafeEqual on fixed-length digests (CWE-208), never regex or
 *   substring matching (the CWE-185/CWE-287 bypass found in the 10.2.x fork).
 * - Freshness window plus single-use nonce cache defeats replay (CWE-294).
 * - Role is bound into the transcript so a panel proof can't be reflected
 *   back as a daemon proof (reflection attack).
 * - Inputs are length/format checked before use (CWE-20); secrets are never
 *   logged (CWE-532).
 */
import * as nodeCrypto from "crypto";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// hkdfSync exists since Node 15, but the panel and daemon pin older
// @types/node that lack its declaration, so it is typed locally here.
const hkdfSync = (nodeCrypto as unknown as {
  hkdfSync(digest: string, ikm: Buffer, salt: Buffer, info: string, keylen: number): ArrayBuffer;
}).hkdfSync;

export const PASSPORT_PROTOCOL = "mcsm-passport-v1";
/** Max clock skew / proof age accepted, in milliseconds. */
export const DEFAULT_MAX_AGE_MS = 60_000;

/** One side's secret pair (the "password + salt" of the original design). */
export interface SecretPair {
  /** >= 32 random bytes, base64url. Store in a secrets manager or 0600 config. */
  secret: string;
  /** >= 16 random bytes, base64url. */
  salt: string;
}

export interface PassportKeys {
  panel: SecretPair;
  daemon: SecretPair;
}

export type PassportRole = "panel" | "daemon";

export interface PassportProof {
  role: PassportRole;
  panelId: string;
  daemonId: string;
  daemonNonce: string;
  panelNonce: string;
  timestamp: number;
  /** HMAC-SHA256, base64url. */
  proof: string;
}

const B64URL = /^[A-Za-z0-9_-]+$/;
const ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** Generate a fresh secret pair with a CSPRNG (NIST SP 800-90A via OpenSSL). */
export function generateSecretPair(): SecretPair {
  return { secret: randomBytes(32).toString("base64url"), salt: randomBytes(16).toString("base64url") };
}

/** 256-bit random nonce, base64url. */
export function generateNonce(): string {
  return randomBytes(32).toString("base64url");
}

function decodeChecked(value: string, minBytes: number, label: string): Buffer {
  if (typeof value !== "string" || !B64URL.test(value)) throw new Error(`Invalid ${label}`);
  const buf = Buffer.from(value, "base64url");
  if (buf.length < minBytes) throw new Error(`${label} too short`);
  return buf;
}

/** Derive the shared session key from both secret pairs (HKDF-SHA256, RFC 5869). */
export function deriveKey(keys: PassportKeys): Buffer {
  const ikm = Buffer.concat([decodeChecked(keys.panel.secret, 32, "panel secret"), decodeChecked(keys.daemon.secret, 32, "daemon secret")]);
  const salt = Buffer.concat([decodeChecked(keys.panel.salt, 16, "panel salt"), decodeChecked(keys.daemon.salt, 16, "daemon salt")]);
  return Buffer.from(hkdfSync("sha256", ikm, salt, PASSPORT_PROTOCOL, 32));
}

function transcript(p: Omit<PassportProof, "proof">): string {
  // Length-prefixed fields so no two different inputs produce the same string.
  return [PASSPORT_PROTOCOL, p.role, p.panelId, p.daemonId, p.daemonNonce, p.panelNonce, String(p.timestamp)]
    .map((f) => `${f.length}:${f}`)
    .join("|");
}

/** Create a proof for `role` over the given nonces. */
export function createProof(keys: PassportKeys, fields: Omit<PassportProof, "proof" | "timestamp"> & { timestamp?: number }): PassportProof {
  const body = { ...fields, timestamp: fields.timestamp ?? Date.now() };
  const proof = createHmac("sha256", deriveKey(keys)).update(transcript(body)).digest("base64url");
  return { ...body, proof };
}

/** Single-use nonce memory with expiry, bounded to avoid memory exhaustion (CWE-400). */
export class NonceCache {
  private readonly seen = new Map<string, number>();
  constructor(private readonly ttlMs = DEFAULT_MAX_AGE_MS * 2, private readonly maxEntries = 10_000) {}
  /** @returns false if the nonce was already used (replay). */
  use(nonce: string, now = Date.now()): boolean {
    for (const [k, exp] of this.seen) if (exp <= now) this.seen.delete(k);
    if (this.seen.has(nonce)) return false;
    if (this.seen.size >= this.maxEntries) this.seen.delete(this.seen.keys().next().value as string);
    this.seen.set(nonce, now + this.ttlMs);
    return true;
  }
}

export interface VerifyOptions {
  expectedRole: PassportRole;
  panelId: string;
  daemonId: string;
  /** The nonce this side issued; the proof must echo it. */
  expectedNonce: { daemonNonce?: string; panelNonce?: string };
  nonceCache?: NonceCache;
  maxAgeMs?: number;
  now?: number;
}

/**
 * Verify a peer's proof. Fails closed: any malformed field returns false.
 * @returns true only if role, ids, nonce, freshness and HMAC all match.
 */
export function verifyProof(keys: PassportKeys, p: PassportProof, opts: VerifyOptions): boolean {
  try {
    if (!p || p.role !== opts.expectedRole) return false;
    if (!ID.test(p.panelId) || !ID.test(p.daemonId)) return false;
    if (p.panelId !== opts.panelId || p.daemonId !== opts.daemonId) return false;
    decodeChecked(p.daemonNonce, 32, "daemon nonce");
    decodeChecked(p.panelNonce, 32, "panel nonce");
    if (opts.expectedNonce.daemonNonce && p.daemonNonce !== opts.expectedNonce.daemonNonce) return false;
    if (opts.expectedNonce.panelNonce && p.panelNonce !== opts.expectedNonce.panelNonce) return false;
    const now = opts.now ?? Date.now();
    if (!Number.isSafeInteger(p.timestamp) || Math.abs(now - p.timestamp) > (opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS)) return false;

    const expected = createProof(keys, { ...p, timestamp: p.timestamp }).proof;
    const a = Buffer.from(expected, "base64url");
    const b = decodeChecked(p.proof, 32, "proof");
    // SECURITY: constant-time compare on equal-length digests (CWE-208).
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    // SECURITY: only burn the nonce after the proof is authentic (CWE-294).
    if (opts.nonceCache && !opts.nonceCache.use(`${p.role}:${p.daemonNonce}:${p.panelNonce}`, now)) return false;
    return true;
  } catch {
    return false;
  }
}
