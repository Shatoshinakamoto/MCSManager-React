/**
 * Panel <-> daemon passport handshake messages, shared by both sides so the
 * wire format cannot drift between them.
 *
 * Flow (all over the existing socket.io connection, no second channel):
 *   1. panel  -> daemon  "auth/challenge"  {}
 *      daemon -> panel   ChallengeResponse (mode, daemonId, single-use nonce)
 *   2. panel  -> daemon  "auth"  AuthRequest (daemon key + mode-specific proof,
 *      plus PairingOffer the first time this panel meets this daemon)
 *      daemon -> panel   AuthResponse (result, daemon proof, PairingReply)
 *
 * Why in-band: the 10.2.x fork verified through a second HTTP call from the
 * daemon back to the panel. That call had its own timeout, address and proxy
 * problems and was the source of most "sometimes won't connect" reports. The
 * standard mode needs no callback at all; only the legacy mode keeps it,
 * because the original design depends on it.
 *
 * SECURITY: everything here is untrusted input until validated with the
 * guards below (CWE-20). Secret pairs travel only inside PairingOffer and
 * PairingReply, once, and only to a daemon that accepted the daemon key; use
 * TLS (wss) for any daemon that is not on localhost (NIST SC-8).
 */
import type { PassportMode } from "./index";
import type { PassportProof, SecretPair } from "./standard";

export interface LegacyPair {
  password: string;
  salt: string;
}

export interface ChallengeResponse {
  mode: PassportMode;
  daemonId: string;
  daemonNonce: string;
  /** True when the daemon is locked to a panel (the fork's "lock"). */
  locked: boolean;
}

export interface PairingOffer {
  panelId: string;
  panel: SecretPair;
  /** The panel's legacy pair ("panelsSha256"), sent only in legacy mode. */
  legacyPanel?: LegacyPair;
}

export interface PairingReply {
  daemonId: string;
  daemon: SecretPair;
  /** The daemon's legacy pair ("sha256"), sent only in legacy mode. */
  legacyDaemon?: LegacyPair;
}

export interface AuthRequest {
  key: string;
  mode: PassportMode;
  panelId: string;
  /** Standard mode: the panel's proof. Absent while pairing. */
  proof?: PassportProof;
  /** Legacy mode: the raw passport and its type. */
  legacy?: { type: number; passport: Record<string, unknown>; entropy?: number };
  pairing?: PairingOffer;
}

export interface AuthResponse {
  result: boolean;
  /** Standard mode: the daemon's proof over the same nonces. */
  proof?: PassportProof;
  pairing?: PairingReply;
  /** Short machine-readable reason when result is false (never secret). */
  reason?: AuthFailReason;
}

export type AuthFailReason =
  | "banned"
  | "bad_request"
  | "bad_key"
  | "mode_mismatch"
  | "no_challenge"
  | "locked_to_other_panel"
  | "repair_requires_unlock"
  | "not_paired"
  | "bad_proof"
  | "legacy_verify_failed"
  | "ip_not_allowed";

const ID = /^[A-Za-z0-9._:-]{1,128}$/;
const B64URL = /^[A-Za-z0-9_-]{1,256}$/;

function isStr(v: unknown, max = 8192): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max;
}

export function isSecretPair(v: unknown): v is SecretPair {
  const o = v as SecretPair;
  return !!o && typeof o === "object" && isStr(o.secret, 256) && B64URL.test(o.secret) && isStr(o.salt, 256) && B64URL.test(o.salt);
}

export function isLegacyPair(v: unknown): v is LegacyPair {
  const o = v as LegacyPair;
  return !!o && typeof o === "object" && isStr(o.password, 1024) && isStr(o.salt, 1024);
}

export function isPassportId(v: unknown): v is string {
  return typeof v === "string" && ID.test(v);
}

/** Shape check for an AuthRequest coming off the socket. */
export function isAuthRequest(v: unknown): v is AuthRequest {
  const o = v as AuthRequest;
  if (!o || typeof o !== "object") return false;
  if (!isStr(o.key, 1024) || !isStr(o.mode, 32) || !isPassportId(o.panelId)) return false;
  if (o.pairing !== undefined) {
    const p = o.pairing;
    if (!p || !isPassportId(p.panelId) || p.panelId !== o.panelId || !isSecretPair(p.panel)) return false;
    if (p.legacyPanel !== undefined && !isLegacyPair(p.legacyPanel)) return false;
  }
  return true;
}

/** Shape check for a PairingReply coming back from a daemon. */
export function isPairingReply(v: unknown): v is PairingReply {
  const o = v as PairingReply;
  if (!o || typeof o !== "object" || !isPassportId(o.daemonId) || !isSecretPair(o.daemon)) return false;
  return o.legacyDaemon === undefined || isLegacyPair(o.legacyDaemon);
}
