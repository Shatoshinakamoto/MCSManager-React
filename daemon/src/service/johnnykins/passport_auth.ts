/**
 * Daemon side of the Johnnykins passport handshake (see
 * common/src/passport/handshake.ts for the wire format).
 *
 * Modes (johnnykins.passport.mode):
 * - "standard": the panel proves it holds both secret pairs with an
 *   HMAC-SHA256 proof over a single-use daemon nonce; the daemon answers with
 *   its own proof so the panel can verify the daemon too. No HTTP callback.
 * - "johnnykins-legacy": the original design. The daemon fingerprints the
 *   passport with JohnsNonAsymmSha256Wrapper and asks the panel at
 *   passport.legacy.panelServerAddress whether it issued it.
 * - "off": upstream behaviour (daemon key only).
 * In every mode the upstream daemon key check runs first.
 *
 * Pairing (the fork's "lock" / "daemon-sync"): the first panel that presents
 * the correct daemon key while lock is false sends its secret pair; the
 * daemon stores it, replies with its own pair, and sets lock = true. After
 * that only the paired panel id is accepted.
 *
 * Fixed from the fork (the intermittent connection failures):
 * - The fork set lock = true even when the daemon-sync call failed (panel not
 *   listening yet), so the daemon was locked with no panel secrets and every
 *   later login failed. Pairing now only locks after both pairs are stored.
 * - The verification call had no timeout; a slow panel held the socket until
 *   the auth timer disconnected it. It now has verifyTimeoutMs.
 * - Config was read into module constants before load(); values are now read
 *   at call time.
 *
 * SECURITY: secrets are never logged (CWE-532); comparisons are constant time
 * (CWE-208); nonces are single use (CWE-294); failures count toward the ban
 * list (NIST AC-7).
 */
import axios from "axios";
import { timingSafeEqual } from "crypto";
import {
  legacyPassport,
  parsePassportMode,
  passportHandshake,
  standardPassport,
  type PassportMode
} from "mcsmanager-common";
import { globalConfiguration } from "../../entity/config";
import RouterContext from "../../entity/ctx";
import logger from "../log";

type AuthResponse = passportHandshake.AuthResponse;

const nonceCache = new standardPassport.NonceCache();

export function passportMode(): PassportMode {
  return parsePassportMode(globalConfiguration.config.johnnykins.passport.mode);
}

/** Constant-time compare of the presented daemon key (upstream check). */
export function keyMatches(presented: unknown): boolean {
  const a = Buffer.from(String(presented ?? ""));
  const b = Buffer.from(String(globalConfiguration.config.key ?? ""));
  // Length is not secret (keys have a fixed format); timingSafeEqual needs equal lengths.
  return a.length === b.length && b.length > 0 && timingSafeEqual(a, b);
}

/** Step 1: issue a single-use nonce for this socket. */
export function issueChallenge(ctx: RouterContext): passportHandshake.ChallengeResponse {
  const p = globalConfiguration.config.johnnykins.passport;
  const nonce = standardPassport.generateNonce();
  ctx.session.passportChallenge = { nonce, expires: Date.now() + Number(p.challengeTtlMs || 30000) };
  return { mode: passportMode(), daemonId: p.daemonId, daemonNonce: nonce, locked: !!p.lock };
}

function takeChallenge(ctx: RouterContext): string | null {
  const c = ctx.session.passportChallenge;
  delete ctx.session.passportChallenge; // single use, even on failure
  if (!c || typeof c.nonce !== "string" || Date.now() > c.expires) return null;
  return c.nonce;
}

function keys(): standardPassport.PassportKeys {
  const p = globalConfiguration.config.johnnykins.passport;
  return { panel: p.panel, daemon: p.daemon };
}

/**
 * Store the panel's pair if this daemon is not locked yet.
 * @returns the reply to send back, null if pairing is not allowed.
 */
function pair(req: passportHandshake.AuthRequest, mode: PassportMode): passportHandshake.PairingReply | null {
  const p = globalConfiguration.config.johnnykins.passport;
  const offer = req.pairing!;
  if (p.lock && p.panelId && p.panelId !== offer.panelId) return null;
  if (mode === "johnnykins-legacy" && !offer.legacyPanel) return null;
  p.panelId = offer.panelId;
  p.panel = { secret: offer.panel.secret, salt: offer.panel.salt };
  if (offer.legacyPanel) p.legacy.panelsSha256 = { ...offer.legacyPanel };
  p.lock = true;
  globalConfiguration.store();
  logger.info(`[Johnnykins] Paired with panel ${offer.panelId}; daemon is now locked to it.`);
  return {
    daemonId: p.daemonId,
    daemon: { ...p.daemon },
    legacyDaemon: mode === "johnnykins-legacy" ? { ...p.legacy.sha256 } : undefined
  };
}

async function verifyLegacy(req: passportHandshake.AuthRequest): Promise<boolean> {
  const p = globalConfiguration.config.johnnykins.passport;
  const legacy = req.legacy;
  if (!legacy || typeof legacy.passport !== "object" || legacy.passport === null) return false;
  const type = legacyPassport.parseLegacyPassportType(p.legacy.passportType);
  if (legacy.type !== type) return false;
  if (!legacyPassport.isLegacyPassport(legacy.passport, type)) return false;
  if (!p.legacy.panelsSha256.password || !p.legacy.panelsSha256.salt) return false;

  const pairs = { panel: p.legacy.panelsSha256, daemon: p.legacy.sha256 };
  const headers: Record<string, string> = {};
  for (const f of legacyPassport.legacyFields(type)) {
    const name = legacyPassport.LEGACY_HEADERS[f as keyof typeof legacyPassport.LEGACY_HEADERS];
    headers[name] = legacyPassport.legacyFingerprint(String(legacy.passport[f]), pairs);
  }
  headers["johnnykins-passport-type"] = String(type);
  headers["johnnykins-daemon-id"] = p.daemonId;
  try {
    const url = new URL("/api/auth/daemon-verifications", p.legacy.panelServerAddress).toString();
    const res = await axios.get(url, {
      headers,
      timeout: Math.max(500, Number(p.legacy.verifyTimeoutMs) || 4000),
      maxRedirects: 0,
      // SECURITY: TLS verification stays on (axios default); never set rejectUnauthorized=false.
      validateStatus: (s) => s === 200
    });
    return res.data?.data?.result === true || res.data?.result === true;
  } catch (err) {
    logger.warn(`[Johnnykins] Legacy passport verification call failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Step 2: verify an AuthRequest. The caller has already checked the ban list.
 */
export async function verifyAuth(ctx: RouterContext, data: unknown): Promise<AuthResponse> {
  const mode = passportMode();
  const p = globalConfiguration.config.johnnykins.passport;

  // Upstream panels send the bare key string. Accepted only in "off" mode.
  if (typeof data === "string") {
    if (mode !== "off") return { result: false, reason: "mode_mismatch" };
    return keyMatches(data) ? { result: true } : { result: false, reason: "bad_key" };
  }
  if (!passportHandshake.isAuthRequest(data)) return { result: false, reason: "bad_request" };
  const req = data;
  if (!keyMatches(req.key)) return { result: false, reason: "bad_key" };
  if (req.mode !== mode) return { result: false, reason: "mode_mismatch" };
  if (mode === "off") return { result: true };

  const daemonNonce = takeChallenge(ctx);
  if (!daemonNonce) return { result: false, reason: "no_challenge" };

  let pairing: passportHandshake.PairingReply | undefined;
  if (req.pairing) {
    if (p.lock && p.panelId !== req.panelId) return { result: false, reason: "locked_to_other_panel" };
    // SECURITY: a locked daemon never hands its pair out again, even to the
    // same panel id (the id is not secret). Re-pairing needs an admin to set
    // johnnykins.passport.lock = false on the daemon.
    if (p.lock) return { result: false, reason: "repair_requires_unlock" };
    const reply = pair(req, mode);
    if (!reply) return { result: false, reason: "bad_request" };
    pairing = reply;
  }
  if (!p.panelId || !p.lock) return { result: false, reason: "not_paired" };
  if (p.panelId !== req.panelId) return { result: false, reason: "locked_to_other_panel" };

  if (mode === "johnnykins-legacy") {
    // The pairing round is authenticated by the daemon key alone (TOFU); the
    // panel immediately re-authenticates with a verifiable passport.
    if (!pairing && !(await verifyLegacy(req))) return { result: false, reason: "legacy_verify_failed" };
    return { result: true, pairing };
  }

  // Standard mode. While pairing, the panel could not build a proof yet; the
  // daemon key (already checked) authenticates this one round (TOFU).
  if (!pairing) {
    const ok =
      !!req.proof &&
      standardPassport.verifyProof(keys(), req.proof, {
        expectedRole: "panel",
        panelId: p.panelId,
        daemonId: p.daemonId,
        expectedNonce: { daemonNonce },
        nonceCache,
        maxAgeMs: Number(p.maxAgeMs) || standardPassport.DEFAULT_MAX_AGE_MS
      });
    if (!ok) return { result: false, reason: "bad_proof" };
  }
  const panelNonce = req.proof?.panelNonce ?? standardPassport.generateNonce();
  const proof = standardPassport.createProof(keys(), {
    role: "daemon",
    panelId: p.panelId,
    daemonId: p.daemonId,
    daemonNonce,
    panelNonce
  });
  return { result: true, proof, pairing };
}
