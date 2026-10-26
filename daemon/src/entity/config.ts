import fs from "fs-extra";
import path from "path";
import { v4 } from "uuid";
import {
  DEFAULT_SANITIZER_OPTIONS,
  DEFAULT_UPDATE_SOURCE_URL,
  LEGACY_DEFAULT_UPDATE_SOURCE_URL,
  PassportMode,
  SanitizerOptions,
  standardPassport
} from "mcsmanager-common";
import { randomBytes } from "crypto";
import StorageSubsystem from "../common/system_storage";
import logger from "../service/log";

function builderPassword() {
  const a = `${v4().replace(/\-/gim, "")}`;
  const b = a.slice(0, a.length / 2 - 1);
  const c = `${v4().replace(/\-/gim, "")}`;
  return b + c;
}

// @Entity
class Config {
  public version = 2;
  public ip = "";
  public port = 24444;
  public prefix = "";
  public key = builderPassword();
  public maxFileTask = 2;
  public maxZipFileSize = 200;
  public language = "en_us";
  public defaultInstancePath = "";
  public defaultJavaDataPath = "";
  public allocatablePortRange = [10010, 65500];
  public currentAllocatablePort = 10010;
  public portAssignInterval = 5;

  // default: Unlimited, if set 40 => (40 packets * 64KB)/s => 2.5MB/s
  public uploadSpeedRate = 0;
  // default: Unlimited, if set 32 => (32 packets * 64KB)/s => 2MB/s
  public downloadSpeedRate = 0;
  // default: 1, if set 0 => Unlimited
  public maxDownloadFromUrlFileCount = 1;

  // Output buffer size (number of chunks) for instance terminal output.
  // Each chunk is up to 256 characters, flushed every 50ms.
  // Increasing this value allows more output per flush cycle,
  // but may increase memory usage under high output load.
  // default: 256 (~64KB per flush), range: 16-4096
  public outputBufferSize = 256;

  // Daemon shutdown behavior
  public enableSoftShutdown = true;
  public softShutdownSkipDocker = true;
  public softShutdownWaitSeconds = 30;

  public whiteListPanelIp = false;
  public whiteListPanelIps = ["127.0.0.1", "::1"];

  ssl = false;
  sslPemPath = "";
  sslKeyPath = "";

  // ---- Update source (manifest URL for manual self-update) ----
  // Primary source: full URL to a manifest describing available updates, e.g.
  // the official GitHub Release manifest (DEFAULT_UPDATE_SOURCE_URL).
  public updateSourceUrl = DEFAULT_UPDATE_SOURCE_URL;
  // Backup source (LEGACY_DEFAULT_UPDATE_SOURCE_URL by default): tried when the
  // primary source cannot be fetched or parsed. Feature disabled only when
  // BOTH source fields are empty.
  public updateSourceUrlFallback = LEGACY_DEFAULT_UPDATE_SOURCE_URL;

  // Johnnykins security settings (passport, bans, sanitizer, feature gates).
  public johnnykins = new JohnnykinsDaemonConfig();
}

/**
 * Johnnykins security settings (ported from the Johnnykins-MCSManager fork's
 * `johnnykins`, `instanceMasterConfig`, ban and passport options).
 * Every key is documented in docs/configuration/daemon-johnnykins.md.
 *
 * SECURITY: this object holds secret pairs. It lives in
 * data/Config/global.json, which store()/load() keep at 0700, and it is
 * never sent to the panel or browser except the one-time pairing reply.
 */
export class JohnnykinsDaemonConfig {
  passport = {
    // "standard" (HMAC challenge-response), "johnnykins-legacy" (original
    // wrapper + HTTP verification call) or "off" (upstream key only).
    mode: "standard" as PassportMode,
    // This daemon's id in the passport transcript.
    daemonId: v4(),
    // This daemon's secret pair (fork: johnnykins.sha256 / standard: daemon pair).
    daemon: standardPassport.generateSecretPair(),
    // The paired panel. Empty until the first successful connection.
    panelId: "",
    panel: { secret: "", salt: "" },
    // Fork: johnnykins.lock. Set by the first pairing; while true only the
    // paired panel can connect. Set to false (and restart) to re-pair.
    lock: false,
    // Accepted proof age. The single-use challenge nonce already guarantees
    // freshness, so this mainly absorbs clock skew between hosts.
    maxAgeMs: 300000,
    // How long a challenge nonce stays valid.
    challengeTtlMs: 30000,
    legacy: {
      // Fork: panelPassportType (1-4) and panelServerAddress.
      passportType: 4,
      panelServerAddress: "http://localhost:23333",
      // Must be shorter than the panel's auth timeout (fork had none).
      verifyTimeoutMs: 4000,
      // Fork: johnnykins.sha256 (this daemon) and johnnykins.panelsSha256 (synced from the panel).
      sha256: { password: randomBytes(32).toString("base64url"), salt: randomBytes(16).toString("base64url") },
      panelsSha256: { password: "", salt: "" }
    }
  };

  // Fork: maxFailedLoginsToBan, banTime, forgiveBans, whitelisted.
  ban = {
    enabled: true,
    maxFailedLoginsToBan: 5,
    // Minutes. Bans always expire (fork: forgiveBans); 0 = never expire.
    banTime: 60,
    // Addresses that are never banned.
    whitelisted: ["127.0.0.1", "::1"],
    // Only when the daemon sits behind a reverse proxy you control: name the
    // proxy addresses here and the X-Forwarded-For client is used instead of
    // the socket address. Empty = never trust forwarding headers.
    trustedProxies: [] as string[]
  };

  // Fork: johnnykins.sanitizer* and mcSanitizer.
  sanitizer: SanitizerOptions = { ...DEFAULT_SANITIZER_OPTIONS };

  // Fork: instanceMasterConfig. Daemon-side switches the panel cannot override.
  // The fork defaulted ptyAccess, openFrpAccess and docker to false; they are
  // true here so upstream features keep working after an upgrade.
  instanceMasterConfig = {
    canSendCommands: true,
    canFileManager: true,
    docker: true,
    // Pseudo-terminal (PTY) mode. Off = instances start in plain pipe mode.
    ptyAccess: true,
    // OpenFRP tunnels started by the daemon (downloads and runs frpc).
    openFrpAccess: true,
    // Minecraft status pings (player count, version, MOTD).
    mcStatus: true
  };

  // Fork: daemon cors/origin/origins, koa-helmet and koa-ratelimit. See
  // service/johnnykins/http_security.ts. The limiter is off by default because
  // large uploads and busy panels can exceed the fork's 20 requests per 10 s.
  http = {
    securityHeaders: true,
    cors: false,
    origins: [] as string[],
    rateLimiter: false,
    rateLimitMax: 120,
    rateLimitDurationMs: 10000
  };

  // Fork: pandoraswall. Locks the HTTP middleware list after startup.
  pandorasWall = false;

  // "Run as" limits (tools/system_user.ts, docs/features/run-as-user.md).
  // Switching accounts needs the daemon to run as root.
  runAs = {
    // Account for instances whose runAs is empty. "" = the daemon's own account (upstream).
    defaultUser: "",
    // Accounts an instance may run as. Empty = any account except root.
    allowedUsers: [] as string[],
    // Allow runAs to name root (uid 0).
    allowRoot: false
  };
}

// daemon configuration class
class GlobalConfiguration {
  public config = new Config();
  private static readonly ID = "global";

  // The config file contains the access key (secret). Keep it owner-only
  // (0700) so other local users cannot read it. StorageSubsystem.store()
  // writes via tmp+rename, so permissions must be re-applied after every
  // write as well (see store()/load()).
  private restrictConfigFilePermission() {
    const filePath = path.normalize(
      path.join(process.cwd(), "data", "Config", `${GlobalConfiguration.ID}.json`)
    );
    try {
      fs.chmodSync(filePath, 0o700);
    } catch (error) {
      // e.g. Windows (limited chmod support) or a foreign file owner —
      // never let permission hardening break the startup/store flow.
      logger.warn("Failed to restrict permissions of the config file:", error);
    }
  }

  load() {
    let config: Config = StorageSubsystem.load("Config", Config, GlobalConfiguration.ID);
    if (config == null) {
      config = new Config();
      StorageSubsystem.store("Config", GlobalConfiguration.ID, config);
    }
    this.config = config;
    // Persist settings added by newer versions (e.g. freshly generated
    // johnnykins secrets) so they stay stable across restarts.
    this.store();
  }

  store() {
    StorageSubsystem.store("Config", GlobalConfiguration.ID, this.config);
    this.restrictConfigFilePermission();
  }
}

class GlobalEnv {
  public fileTaskCount = 0;
}

const globalConfiguration = new GlobalConfiguration();
const globalEnv = new GlobalEnv();

export { Config, globalConfiguration, globalEnv };
