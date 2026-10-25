/**
 * Panel side of the Johnnykins passport handshake with a daemon (see
 * common/src/passport/handshake.ts for the wire format and
 * daemon/src/service/johnnykins/passport_auth.ts for the other side).
 *
 * Replaces the fork's RemoteService.auth() passport switch and its
 * LimitedLRUArray "RemotePassports" (see LegacyPassportStore for the
 * overwrite/eviction bug that made daemons fail to connect intermittently).
 *
 * SECURITY: secrets are never logged (the fork logged every passport with
 * "Passport Answer:", CWE-532). The daemon's proof is verified, so the panel
 * also authenticates the daemon (mutual auth, NIST IA-3). Pairing data from
 * the daemon is shape-checked before it is stored (CWE-20).
 */
import {
  legacyPassport,
  parsePassportMode,
  passportHandshake,
  standardPassport
} from "mcsmanager-common";
import Storage from "../../common/storage/sys_storage";
import type RemoteService from "../../entity/remote_service";
import { systemConfig } from "../../setting";
import { logger } from "../log";
import RemoteRequest from "../remote_command";

/** Passports issued in legacy mode, waiting for the daemon's verification call. */
export const legacyPassportStore = new legacyPassport.LegacyPassportStore(60_000, 256);

const daemonNonceCache = new standardPassport.NonceCache();

export interface AuthOutcome {
  ok: boolean;
  reason?: string;
}

function cfg() {
  if (!systemConfig) throw new Error("System config is not loaded");
  return systemConfig.johnnykins.passport;
}

function isPaired(service: RemoteService) {
  const p = service.config.passport;
  return !!(p?.daemonId && p.daemon?.secret && p.daemon?.salt);
}

async function forgetPairing(service: RemoteService) {
  service.config.passport = { daemonId: "", daemon: { secret: "", salt: "" }, legacyDaemon: { password: "", salt: "" } };
  await Storage.getStorage().store("RemoteServiceConfig", service.uuid, service.config);
}

/**
 * Run the passport handshake on a freshly connected socket.
 * @param attempt internal: re-pair after an unlock and the legacy
 *   post-pairing login each take one more attempt (bounded at 3 rounds).
 */
export async function passportAuth(service: RemoteService, attempt = 0): Promise<AuthOutcome> {
  const retry = attempt < 2;
  const jp = cfg();
  const mode = parsePassportMode(jp.mode);
  const timeout = Number(jp.authTimeoutMs) || 8000;
  const key = service.config.apiKey;
  const panelId = systemConfig!.panelId;

  if (mode === "off") {
    // Upstream behaviour: bare key, bare boolean reply.
    const res = await new RemoteRequest(service).request("auth", key, timeout, true);
    return { ok: res === true, reason: res === true ? undefined : "bad_key" };
  }

  const ch = (await new RemoteRequest(service).request("auth/challenge", {}, timeout, true)) as passportHandshake.ChallengeResponse | null;
  if (!ch || typeof ch.daemonNonce !== "string" || !passportHandshake.isPassportId(ch.daemonId)) {
    return { ok: false, reason: "no_challenge (daemon too old, banned, or IP not allowed)" };
  }
  if (ch.mode !== mode) return { ok: false, reason: `mode_mismatch (panel=${mode}, daemon=${ch.mode})` };

  // A different daemonId means the daemon was reinstalled; pair again.
  if (isPaired(service) && service.config.passport.daemonId !== ch.daemonId) await forgetPairing(service);
  const pairing = !isPaired(service);

  const req: passportHandshake.AuthRequest = { key, mode, panelId };
  if (pairing) {
    req.pairing = {
      panelId,
      panel: { ...jp.panel },
      legacyPanel: mode === "johnnykins-legacy" ? { ...jp.legacy.panelsSha256 } : undefined
    };
  }

  const keys = (): standardPassport.PassportKeys => ({ panel: jp.panel, daemon: service.config.passport.daemon });
  let panelNonce = standardPassport.generateNonce();
  let legacyId: number | undefined;

  if (mode === "standard" && !pairing) {
    req.proof = standardPassport.createProof(keys(), { role: "panel", panelId, daemonId: ch.daemonId, daemonNonce: ch.daemonNonce, panelNonce });
  }
  if (mode === "johnnykins-legacy") {
    const type = legacyPassport.parseLegacyPassportType(jp.legacy.passportType);
    const entropy = jp.legacy.tokenEntropy ? legacyPassport.createTokenEntropy(jp.legacy.maxEntropy) : 1;
    const raw = legacyPassport.createLegacyPassport(type, key, service.uuid, entropy);
    req.legacy = { type, passport: raw as unknown as Record<string, unknown>, entropy };
    if (!pairing) {
      legacyId = legacyPassportStore.add(type, legacyPassport.fingerprintPassport(raw, type, {
        panel: jp.legacy.panelsSha256,
        daemon: service.config.passport.legacyDaemon
      }));
    }
  }

  let res: passportHandshake.AuthResponse;
  try {
    res = await new RemoteRequest(service).request("auth", req, timeout, true);
  } finally {
    if (legacyId !== undefined) legacyPassportStore.remove(legacyId);
  }
  if (!res || res.result !== true) {
    const reason = res?.reason ?? "no_reply";
    // The daemon was unlocked for re-pairing: drop our copy and pair once more.
    if (reason === "not_paired" && retry && !pairing) {
      await forgetPairing(service);
      return passportAuth(service, attempt + 1);
    }
    return { ok: false, reason };
  }

  if (pairing) {
    if (!passportHandshake.isPairingReply(res.pairing) || res.pairing.daemonId !== ch.daemonId) {
      return { ok: false, reason: "bad_pairing_reply" };
    }
    service.config.passport = {
      daemonId: res.pairing.daemonId,
      daemon: { ...res.pairing.daemon },
      legacyDaemon: res.pairing.legacyDaemon ? { ...res.pairing.legacyDaemon } : { password: "", salt: "" }
    };
    await Storage.getStorage().store("RemoteServiceConfig", service.uuid, service.config);
    logger.info(`[Johnnykins] Paired with daemon ${ch.daemonId} (${service.config.remarks || service.uuid}).`);
    // Legacy mode: the pairing round carried no verifiable passport; reconnect
    // once so this session is verified the normal way.
    if (mode === "johnnykins-legacy") return retry ? passportAuth(service, attempt + 1) : { ok: false, reason: "legacy_pairing_retry_failed" };
  }

  if (mode === "standard") {
    if (!pairing) panelNonce = req.proof!.panelNonce;
    const ok =
      !!res.proof &&
      standardPassport.verifyProof(keys(), res.proof, {
        expectedRole: "daemon",
        panelId,
        daemonId: ch.daemonId,
        expectedNonce: { daemonNonce: ch.daemonNonce, panelNonce: pairing ? undefined : panelNonce },
        nonceCache: daemonNonceCache,
        maxAgeMs: 300_000
      });
    if (!ok) return { ok: false, reason: "bad_daemon_proof" };
  }
  return { ok: true };
}
