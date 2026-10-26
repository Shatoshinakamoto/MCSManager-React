import Router from "@koa/router";
import formidable from "formidable";
import * as fs from "fs-extra";
import path from "path";
import { v4 } from "uuid";
import { diffConfig } from "../common/config_diff";
import { MARKET_CACHE_FILE_PATH, SAVE_DIR_PATH } from "../const";
import SystemConfig, { clampRemoteServiceMs, DataPlaneMode } from "../entity/setting";
import { ROLE } from "../entity/user";
import { $t, i18next } from "../i18n";
import { speedLimit } from "../middleware/limit";
import permission from "../middleware/permission";
import {
  getFrontendLayoutConfig,
  resetFrontendLayoutConfig,
  setFrontendLayoutConfig
} from "../service/frontend_layout";
import { logger } from "../service/log";
import { getOperationLoggerOperator, operationLogger } from "../service/operation_logger";
import remoteService from "../service/remote_service";
import userSystem from "../service/user_service";
import { saveSystemConfig, systemConfig } from "../setting";
import { legacyPassport, parsePassportMode } from "mcsmanager-common";
import { checkFileName } from "../utils/safe";
import net from "net";
import { decodeDaemonServerId } from "../middleware/additional_security";
import { getUserFromCtx } from "../service/passport_service";
import { isWebAdmin } from "../service/web_admin";
import { checkBusinessMode } from "../version";

const router = new Router({ prefix: "/overview" });

// [Top-level Permission]
// Get panel configuration items
router.get("/setting", permission({ level: ROLE.WEBADMIN }), async (ctx) => {
  if (!systemConfig) {
    ctx.body = systemConfig;
    return;
  }
  // SECURITY: never send secrets to the browser (CWE-200). The Johnnykins
  // section is reduced to its non-secret switches.
  const jp = systemConfig.johnnykins.passport;
  ctx.body = {
    ...systemConfig,
    ssoClientSecret: "",
    gatewaySecret: "",
    johnnykins: {
      passport: {
        mode: jp.mode,
        authTimeoutMs: jp.authTimeoutMs,
        legacy: {
          passportType: jp.legacy.passportType,
          tokenEntropy: jp.legacy.tokenEntropy,
          maxEntropy: jp.legacy.maxEntropy,
          passportTtlSeconds: jp.legacy.passportTtlSeconds
        }
      },
      remoteService: {
        heartbeatIntervalMs: clampRemoteServiceMs("heartbeatIntervalMs", systemConfig.johnnykins.remoteService?.heartbeatIntervalMs),
        localDaemonRetryMs: clampRemoteServiceMs("localDaemonRetryMs", systemConfig.johnnykins.remoteService?.localDaemonRetryMs)
      }
    }
  };
});

function boundedInt(value: unknown, min: number, max: number, name: string) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`${name} must be a whole number from ${min} to ${max}`);
  return n;
}

/**
 * Validates and applies the Additional Security fields.
 * SECURITY: every value is type-checked; origins must be exact http(s)
 * origins (no wildcards, CWE-942) and daemon allow-list entries must be IPs.
 */
function applyAdditionalSecurity(ctx: Router.RouterContext, config: Partial<SystemConfig>) {
  if (!systemConfig) return;
  if (config.cors != null) systemConfig.cors = Boolean(config.cors);
  if (config.origin != null) {
    const origins = String(config.origin)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    for (const o of origins) {
      let url: URL;
      try {
        url = new URL(o);
      } catch {
        throw new Error(`Invalid CORS origin: ${o}`);
      }
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== o)
        throw new Error(`CORS origin must be an exact http(s) origin such as https://example.com: ${o}`);
    }
    systemConfig.origin = origins.join(",");
  }
  if (config.helmet != null) systemConfig.helmet = Boolean(config.helmet);
  if (config.rateLimiter != null) systemConfig.rateLimiter = Boolean(config.rateLimiter);
  if (config.rateLimitMax != null)
    systemConfig.rateLimitMax = boundedInt(config.rateLimitMax, 1, 100000, "rateLimitMax");
  if (config.rateLimitDuration != null)
    systemConfig.rateLimitDuration = boundedInt(
      config.rateLimitDuration,
      1000,
      86400000,
      "rateLimitDuration"
    );
  if (config.daemonServerIDs != null) {
    if (!Array.isArray(config.daemonServerIDs)) throw new Error("daemonServerIDs must be a list");
    const ids = config.daemonServerIDs.map((v) => String(v).trim()).filter(Boolean);
    for (const id of ids) {
      if (!net.isIP(decodeDaemonServerId(id)))
        throw new Error(`Daemon allow-list entries must be IP addresses: ${id}`);
    }
    systemConfig.daemonServerIDs = ids;
  }
  // Takes effect on the next panel start (the stack is locked once, at startup).
  if (config.pandorasWall != null) systemConfig.pandorasWall = Boolean(config.pandorasWall);
  if (config.devBlocker != null) systemConfig.devBlocker = Boolean(config.devBlocker);
  if (config.sessionMaxAgeMinutes != null)
    systemConfig.sessionMaxAgeMinutes = boundedInt(
      config.sessionMaxAgeMinutes,
      0,
      10080,
      "sessionMaxAgeMinutes"
    );
  if (config.webAdminEnforced != null) {
    const enforce = Boolean(config.webAdminEnforced);
    // SECURITY: only a Web Admin may switch enforcement on, so it can never
    // lock every account out of the Web Admin pages.
    if (enforce && !systemConfig.webAdminEnforced && !isWebAdmin(getUserFromCtx(ctx)))
      throw new Error("Only a Web Admin can turn on Web Admin enforcement.");
    systemConfig.webAdminEnforced = enforce;
  }
}

// [Top-level Permission]
// Update panel configuration items
router.put("/setting", permission({ level: ROLE.WEBADMIN }), async (ctx) => {
  const config = ctx.request.body as Partial<SystemConfig>;
  if (config && systemConfig) {
    // Snapshot for the audit log (masked diff is computed after all mutations)
    const systemConfigBefore = JSON.parse(JSON.stringify(systemConfig)) as SystemConfig;
    if (config.httpIp != null) systemConfig.httpIp = config.httpIp;
    if (config.httpPort != null) systemConfig.httpPort = config.httpPort;
    if (config.prefix != null) systemConfig.prefix = config.prefix;
    if (config.reverseProxyMode != null) systemConfig.reverseProxyMode = config.reverseProxyMode;
    if (config.reverseProxyHeader != null)
      systemConfig.reverseProxyHeader = config.reverseProxyHeader;
    if (config.crossDomain != null) systemConfig.crossDomain = config.crossDomain;
    if (config.gzip != null) systemConfig.gzip = config.gzip;
    if (config.maxCompress != null) systemConfig.maxCompress = config.maxCompress;
    if (config.maxDownload != null) systemConfig.maxDownload = config.maxDownload;
    if (config.zipType != null) systemConfig.zipType = config.zipType;
    if (config.totpDriftToleranceSteps != null)
      systemConfig.totpDriftToleranceSteps = config.totpDriftToleranceSteps;
    if (config.loginCheckIp != null) systemConfig.loginCheckIp = config.loginCheckIp;
    if (config.forwardType != null) systemConfig.forwardType = Number(config.forwardType);
    if (config.dataPlane != null) {
      const mode = String(config.dataPlane);
      if (mode !== DataPlaneMode.Direct && mode !== DataPlaneMode.Proxy)
        throw new Error("dataPlane must be 'direct' or 'proxy'");
      systemConfig.dataPlane = mode as DataPlaneMode;
    }
    if (config.dataPort != null) systemConfig.dataPort = Number(config.dataPort);
    if (config.loginInfo != null) systemConfig.loginInfo = String(config.loginInfo);
    if (config.canFileManager != null) systemConfig.canFileManager = Boolean(config.canFileManager);
    if (config.allowUsePreset != null) systemConfig.allowUsePreset = Boolean(config.allowUsePreset);

    if (config.businessMode != null) systemConfig.businessMode = Boolean(config.businessMode);
    if (config.businessId != null) systemConfig.businessId = String(config.businessId);
    if (config.allowChangeCmd != null) systemConfig.allowChangeCmd = Boolean(config.allowChangeCmd);
    if (config.registerCode != null) systemConfig.registerCode = String(config.registerCode);
    if (config.panelId != null) systemConfig.panelId = String(config.panelId);
    if (config.enableApiKey != null) systemConfig.enableApiKey = config.enableApiKey;

    // Additional Security (docs/configuration/panel-additional-security.md)
    applyAdditionalSecurity(ctx, config);

    // Update source (panel self-update manifest URLs)
    if (config.updateSourceUrl != null)
      systemConfig.updateSourceUrl = String(config.updateSourceUrl);
    if (config.updateSourceUrlFallback != null)
      systemConfig.updateSourceUrlFallback = String(config.updateSourceUrlFallback);

    if (config.operationLogEnabled != null)
      systemConfig.operationLogEnabled = config.operationLogEnabled;
    if (config.operationLogMaxLinesPerFile != null)
      systemConfig.operationLogMaxLinesPerFile = config.operationLogMaxLinesPerFile;
    if (config.operationLogKeepDays != null)
      systemConfig.operationLogKeepDays = config.operationLogKeepDays;
    if (config.operationLogMaxTotalLines != null)
      systemConfig.operationLogMaxTotalLines = config.operationLogMaxTotalLines;
    if (config.operationLogRecordLogin != null)
      systemConfig.operationLogRecordLogin = config.operationLogRecordLogin;
    if (config.operationLogRecordInstance != null)
      systemConfig.operationLogRecordInstance = config.operationLogRecordInstance;
    if (config.operationLogRecordFile != null)
      systemConfig.operationLogRecordFile = config.operationLogRecordFile;
    if (config.operationLogRecordUser != null)
      systemConfig.operationLogRecordUser = config.operationLogRecordUser;
    if (config.operationLogRecordSystem != null)
      systemConfig.operationLogRecordSystem = config.operationLogRecordSystem;

    if (config.presetPackAddr != null) {
      // clear cache
      fs.remove(MARKET_CACHE_FILE_PATH).catch((err) => {
        logger.warn(`Failed to clear preset pack cache file at ${MARKET_CACHE_FILE_PATH}: ${err}`);
      });
      systemConfig.presetPackAddr = String(config.presetPackAddr);
    }

    if (config.language != null) {
      logger.warn($t("TXT_CODE_e29a9317"), config.language);
      systemConfig.language = String(config.language);
      await i18next.changeLanguage(systemConfig.language.toLowerCase());
      remoteService.changeDaemonLanguage(systemConfig.language);
    }

    // Snapshot identity-critical SSO fields before applying changes
    const prevSsoType = systemConfig.ssoType || "oidc";
    const prevSsoIssuer = systemConfig.ssoIssuer;
    const prevSsoUserinfoUrl = systemConfig.ssoUserinfoUrl;
    const prevSsoUserIdField = systemConfig.ssoUserIdField || "id";

    // SSO type
    if (config.ssoType != null) {
      const t = String(config.ssoType);
      if (t !== "oidc" && t !== "oauth2") throw new Error("ssoType must be 'oidc' or 'oauth2'");
      systemConfig.ssoType = t;
    }
    const ssoType = systemConfig.ssoType || "oidc";

    // SSO Token Endpoint client authentication method
    if (config.ssoTokenAuthMethod != null) {
      const m = String(config.ssoTokenAuthMethod);
      if (m !== "auto" && m !== "client_secret_basic" && m !== "client_secret_post") {
        throw new Error(
          "ssoTokenAuthMethod must be 'auto', 'client_secret_basic' or 'client_secret_post'"
        );
      }
      systemConfig.ssoTokenAuthMethod = m;
    }

    // SSO core fields
    {
      const wantEnable =
        config.ssoEnabled != null ? Boolean(config.ssoEnabled) : systemConfig.ssoEnabled;
      const clientId =
        config.ssoClientId != null ? String(config.ssoClientId) : systemConfig.ssoClientId;
      const clientSecret = config.ssoClientSecret
        ? String(config.ssoClientSecret)
        : systemConfig.ssoClientSecret;

      if (ssoType === "oidc") {
        const issuer = config.ssoIssuer != null ? String(config.ssoIssuer) : systemConfig.ssoIssuer;
        if (issuer && !issuer.startsWith("https://")) {
          throw new Error("SSO Issuer URL must use the https protocol");
        }
        if (wantEnable && (!issuer?.trim() || !clientId?.trim() || !clientSecret?.trim())) {
          throw new Error(
            "Cannot enable SSO (OIDC): Issuer, Client ID, and Client Secret are required"
          );
        }
        const oidcCredentialsChanged =
          issuer !== systemConfig.ssoIssuer ||
          clientId !== systemConfig.ssoClientId ||
          clientSecret !== systemConfig.ssoClientSecret;
        const needVerify =
          wantEnable &&
          Boolean(issuer?.trim() && clientId?.trim() && clientSecret?.trim()) &&
          (!systemConfig.ssoEnabled || oidcCredentialsChanged);
        if (needVerify) {
          const { verifyIssuer } = require("../service/sso_service");
          await verifyIssuer(issuer, clientId, clientSecret);
        }
        if (config.ssoIssuer != null) systemConfig.ssoIssuer = issuer;
      } else {
        // OAuth 2.0
        const authorizeUrl =
          config.ssoAuthorizeUrl != null
            ? String(config.ssoAuthorizeUrl)
            : systemConfig.ssoAuthorizeUrl;
        const tokenUrl =
          config.ssoTokenUrl != null ? String(config.ssoTokenUrl) : systemConfig.ssoTokenUrl;
        const userinfoUrl =
          config.ssoUserinfoUrl != null
            ? String(config.ssoUserinfoUrl)
            : systemConfig.ssoUserinfoUrl;

        const validateUrl = (url: string, name: string) => {
          if (url && !url.startsWith("https://") && !url.startsWith("http://")) {
            throw new Error(`SSO ${name} must use http(s) protocol`);
          }
        };
        validateUrl(authorizeUrl, "Authorize URL");
        validateUrl(tokenUrl, "Token URL");
        validateUrl(userinfoUrl, "Userinfo URL");

        if (
          wantEnable &&
          (!authorizeUrl?.trim() ||
            !tokenUrl?.trim() ||
            !userinfoUrl?.trim() ||
            !clientId?.trim() ||
            !clientSecret?.trim())
        ) {
          throw new Error(
            "Cannot enable SSO (OAuth 2.0): Authorize URL, Token URL, Userinfo URL, Client ID, and Client Secret are required"
          );
        }

        if (config.ssoAuthorizeUrl != null) systemConfig.ssoAuthorizeUrl = authorizeUrl;
        if (config.ssoTokenUrl != null) systemConfig.ssoTokenUrl = tokenUrl;
        if (config.ssoUserinfoUrl != null) systemConfig.ssoUserinfoUrl = userinfoUrl;
      }

      if (config.ssoEnabled != null) systemConfig.ssoEnabled = wantEnable;
      if (config.ssoClientId != null) systemConfig.ssoClientId = clientId;
      if (config.ssoClientSecret) systemConfig.ssoClientSecret = clientSecret;
    }

    if (config.ssoUserIdField != null)
      systemConfig.ssoUserIdField = String(config.ssoUserIdField) || "id";

    // Unbind all SSO users when identity-critical fields change
    {
      const typeChanged = systemConfig.ssoType !== prevSsoType;
      const issuerChanged = ssoType === "oidc" && systemConfig.ssoIssuer !== prevSsoIssuer;
      const userinfoChanged =
        ssoType === "oauth2" && systemConfig.ssoUserinfoUrl !== prevSsoUserinfoUrl;
      const userIdFieldChanged =
        ssoType === "oauth2" && systemConfig.ssoUserIdField !== prevSsoUserIdField;

      if (typeChanged || issuerChanged || userinfoChanged || userIdFieldChanged) {
        const count = await userSystem.unbindAllSso();
        if (count > 0) {
          logger.warn(`[SSO] Identity-critical config changed, unbound ${count} SSO user(s).`);
        }
      }
    }
    if (config.ssoScopes != null) systemConfig.ssoScopes = String(config.ssoScopes);
    if (config.ssoOnlyMode != null) systemConfig.ssoOnlyMode = Boolean(config.ssoOnlyMode);
    if (config.ssoAutoRedirect != null)
      systemConfig.ssoAutoRedirect = Boolean(config.ssoAutoRedirect);
    if (config.ssoProviderName != null)
      systemConfig.ssoProviderName = String(config.ssoProviderName);
    if (config.ssoIconUrl != null) {
      const iconUrl = String(config.ssoIconUrl);
      if (
        iconUrl &&
        !iconUrl.startsWith("https://") &&
        !iconUrl.startsWith("http://") &&
        !iconUrl.startsWith("/")
      ) {
        throw new Error("SSO icon URL must use http(s) protocol or be a relative path");
      }
      systemConfig.ssoIconUrl = iconUrl;
    }
    if (config.ssoCallbackUrl != null) {
      const cbUrl = String(config.ssoCallbackUrl);
      if (cbUrl) {
        if (!cbUrl.startsWith("https://") && !cbUrl.startsWith("http://")) {
          throw new Error("SSO Callback URL must use http(s) protocol");
        }
        let parsed: URL;
        try {
          parsed = new URL(cbUrl);
        } catch {
          throw new Error("SSO Callback URL is not a valid absolute URL");
        }
        if (parsed.search || parsed.hash) {
          throw new Error("SSO Callback URL must not contain a query string or fragment");
        }
        if (!parsed.pathname.endsWith("/api/auth/sso/callback")) {
          throw new Error("SSO Callback URL must end with /api/auth/sso/callback");
        }
      }
      systemConfig.ssoCallbackUrl = cbUrl;
    }
    if (config.ssoAllowedRedirectHosts != null) {
      const raw = String(config.ssoAllowedRedirectHosts);
      const hosts = raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      for (const h of hosts) {
        let ok = false;
        try {
          const u = new URL(`http://${h}`);
          ok =
            u.host === h &&
            u.pathname === "/" &&
            !u.username &&
            !u.password &&
            !u.search &&
            !u.hash;
        } catch {
          ok = false;
        }
        if (!ok) throw new Error(`Invalid SSO allowed redirect host: ${h}`);
      }
      systemConfig.ssoAllowedRedirectHosts = hosts.join(",");
    }

    // Johnnykins passport switches (secrets are not editable over the API).
    const jIn = config.johnnykins?.passport;
    if (jIn && typeof jIn === "object") {
      const jp = systemConfig.johnnykins.passport;
      if (jIn.mode != null) jp.mode = parsePassportMode(jIn.mode);
      if (jIn.authTimeoutMs != null) jp.authTimeoutMs = Math.min(Math.max(Number(jIn.authTimeoutMs) || 8000, 2000), 60000);
      const l = jIn.legacy;
      if (l && typeof l === "object") {
        if (l.passportType != null) jp.legacy.passportType = legacyPassport.parseLegacyPassportType(Number(l.passportType));
        if (l.tokenEntropy != null) jp.legacy.tokenEntropy = Boolean(l.tokenEntropy);
        if (l.maxEntropy != null) jp.legacy.maxEntropy = Math.min(Math.max(Math.floor(Number(l.maxEntropy) || 3), 1), 10);
        if (l.passportTtlSeconds != null) jp.legacy.passportTtlSeconds = Math.min(Math.max(Math.floor(Number(l.passportTtlSeconds) || 60), 5), 600);
      }
    }

    const rsIn = config.johnnykins?.remoteService;
    if (rsIn && typeof rsIn === "object") {
      const rs = (systemConfig.johnnykins.remoteService ??= { heartbeatIntervalMs: 60000, localDaemonRetryMs: 5000 });
      if (rsIn.heartbeatIntervalMs != null) rs.heartbeatIntervalMs = clampRemoteServiceMs("heartbeatIntervalMs", rsIn.heartbeatIntervalMs);
      if (rsIn.localDaemonRetryMs != null) rs.localDaemonRetryMs = clampRemoteServiceMs("localDaemonRetryMs", rsIn.localDaemonRetryMs);
    }

    const diff = diffConfig(systemConfigBefore, JSON.parse(JSON.stringify(systemConfig)));
    if (diff) {
      operationLogger.log(
        "system_config_change",
        {
          ...getOperationLoggerOperator(ctx),
          config_before: diff.before,
          config_after: diff.after
        },
        "warning",
        config.operationLogEnabled !== systemConfigBefore.operationLogEnabled
      );
    }

    saveSystemConfig(systemConfig);
    checkBusinessMode();
    operationLogger.runRetention();
    ctx.body = "OK";
    return;
  }
  ctx.body = new Error($t("TXT_CODE_e4d6cc20"));
});

// [Public Permission]
// Update config when install
router.put("/install", async (ctx) => {
  const config = ctx.request.body;
  if (userSystem.objects.size === 0 && systemConfig) {
    if (config.language != null) {
      logger.warn($t("TXT_CODE_e29a9317"), config.language);
      systemConfig.language = String(config.language);
      i18next.changeLanguage(systemConfig.language.toLowerCase());
      remoteService.changeDaemonLanguage(systemConfig.language);
    }
    saveSystemConfig(systemConfig);
    ctx.body = "OK";
    return;
  }
  ctx.body = new Error($t("TXT_CODE_d37f0418"));
});

// [Public router]
router.get("/layout", async (ctx) => {
  ctx.body = getFrontendLayoutConfig();
});

// [Top-level Permission]
// Set frontend layout
router.post("/layout", permission({ level: ROLE.WEBADMIN }), async (ctx) => {
  const config = ctx.request.body;
  setFrontendLayoutConfig(config);
  ctx.body = true;
});

// [Top-level Permission]
// Reset frontend layout
router.delete("/layout", permission({ level: ROLE.WEBADMIN }), async (ctx) => {
  resetFrontendLayoutConfig();
  ctx.body = true;
});

const ALLOWED_ASSET_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
  // Music card (audio is played by the browser, never executed).
  ".mp3", ".ogg", ".wav", ".m4a", ".flac", ".aac"
]);
const MAX_MARKET_FILE_BYTES = 20 * 1024 * 1024;
/** Legacy plugin card files. Served as inert text (see app.ts), run only inside the sandboxed plugin host. */
const PLUGIN_HTML_EXTENSIONS = new Set([".html", ".htm"]);
const MAX_PLUGIN_HTML_BYTES = 2 * 1024 * 1024;

/**
 * Accept a JSON upload only if it is a market template file
 * (`{ packages: [...] }`). Anything else, including HTML disguised as .json,
 * is refused before it is stored under the panel's public folder (CWE-434).
 */
async function assertMarketTemplateFile(filePath: string) {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_MARKET_FILE_BYTES) throw new Error("Market template file is too large");
  let data: unknown;
  try {
    data = JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    throw new Error("Only image files or a valid market template (.json) can be uploaded");
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as { packages?: unknown }).packages))
    throw new Error("The JSON file is not a market template (missing a packages list)");
}

// [Top-level Permission]
// Upload file to asserts directory, only administrator can upload
router.post("/upload_assets", permission({ level: ROLE.WEBADMIN }), async (ctx) => {
  let files = ctx.request.files?.file;
  let tmpFile: formidable.File | undefined;
  if (Array.isArray(files)) {
    tmpFile = files[0];
  } else {
    tmpFile = files;
  }
  try {
    if (!tmpFile) throw new Error($t("TXT_CODE_e4d6cc20"));
    if (!tmpFile.filepath || !fs.existsSync(tmpFile.filepath))
      throw new Error($t("TXT_CODE_1a499109"));
    // SECURITY: these files are served from the panel's own origin, so only
    // raster images, audio, market template files and plugin HTML (served as text) are accepted (upstream took any
    // extension; an .html or .svg upload would run script as the panel,
    // CWE-434/CWE-79). The UI uses this for the logo, the background image,
    // the image and carousel cards, the music card and the market editor's "Save to panel".
    let ext = path.extname(tmpFile.originalFilename || "").toLowerCase();
    // The market editor posts a Blob, which arrives with no usable extension.
    if (ext === ".json" || ext === "") {
      await assertMarketTemplateFile(tmpFile.filepath);
      ext = ".json";
    }
    // HTML plugins: the panel never serves these as HTML. app.ts sends every
    // .html/.htm under upload_files as text/plain with nosniff and a CSP
    // sandbox, so opening one directly cannot run script as the panel; only
    // the plugin card's sandboxed host frame runs them (CWE-434, CWE-79).
    if (PLUGIN_HTML_EXTENSIONS.has(ext)) {
      if ((await fs.stat(tmpFile.filepath)).size > MAX_PLUGIN_HTML_BYTES) throw new Error("Plugin HTML file is too large (2 MB max)");
      ext = ".html";
    }
    if (!ALLOWED_ASSET_EXTENSIONS.has(ext) && ext !== ".json" && ext !== ".html")
      throw new Error(
        "Only image, audio, plugin HTML or market template files can be uploaded (png, jpg, jpeg, gif, webp, ico, mp3, ogg, wav, m4a, flac, aac, html, json)"
      );
    const newFileName = v4() + ext;
    if (!checkFileName(newFileName)) throw new Error("Access denied: Malformed file name");
    const saveDirPath = path.join(process.cwd(), SAVE_DIR_PATH);
    if (!fs.existsSync(saveDirPath)) fs.mkdirsSync(saveDirPath);
    await fs.move(tmpFile.filepath, path.join(saveDirPath, newFileName));
    ctx.body = newFileName;
  } finally {
    if (Array.isArray(files)) {
      files.forEach((v) => {
        if (v?.filepath) fs.remove(v.filepath, () => {});
      });
    } else {
      if (tmpFile?.filepath) fs.remove(tmpFile.filepath, () => {});
    }
  }
});

router.post(
  "/refresh_business_mode",
  speedLimit(5),
  permission({ level: ROLE.ADMIN }),
  async (ctx) => {
    await checkBusinessMode();
    ctx.body = "OK";
  }
);

export default router;
