/** Panel settings, self-update and asset upload endpoints (same URLs as upstream services/apis). */
import { defineApi, type RequestConfig } from "@/services/apiService";

export enum DataPlaneMode {
  Direct = "direct",
  Proxy = "proxy"
}

/** Non-secret Johnnykins passport switches returned by GET /api/overview/setting. */
export interface JohnnykinsPanelSwitches {
  passport: {
    mode: "standard" | "johnnykins-legacy" | "off";
    authTimeoutMs: number;
    legacy: { passportType: number; tokenEntropy: boolean; maxEntropy: number; passportTtlSeconds: number };
  };
  /** Daemon connection timing (fork: remoteService.heartbeatInterval / connectionTimeout). */
  remoteService?: { heartbeatIntervalMs: number; localDaemonRetryMs: number };
}

export interface Settings {
  httpPort: number;
  httpIp: string;
  reverseProxyMode: boolean;
  reverseProxyHeader: string;
  dataPort: number;
  forwardType: number;
  dataPlane: DataPlaneMode;
  crossDomain: boolean;
  // Additional Security (docs/configuration/panel-additional-security.md)
  cors?: boolean;
  origin?: string;
  helmet?: boolean;
  rateLimiter?: boolean;
  rateLimitMax?: number;
  rateLimitDuration?: number;
  daemonServerIDs?: string[];
  pandorasWall?: boolean;
  devBlocker?: boolean;
  webAdminEnforced?: boolean;
  sessionMaxAgeMinutes?: number;
  gzip: boolean;
  maxCompress: number;
  maxDownload: number;
  zipType: number;
  totpDriftToleranceSteps: number;
  loginCheckIp: boolean;
  loginInfo: string;
  canFileManager: boolean;
  language: string;
  presetPackAddr: string;
  redisUrl: string;
  allowUsePreset: boolean;
  businessMode: boolean;
  businessId: string;
  allowChangeCmd: boolean;
  enableApiKey: boolean | "ONLY_ADMIN";
  registerCode: string;
  panelId: string;
  ssoEnabled: boolean;
  ssoOnlyMode: boolean;
  ssoAutoRedirect: boolean;
  ssoProviderName: string;
  ssoIconUrl: string;
  ssoIssuer: string;
  ssoType?: string;
  ssoAuthorizeUrl?: string;
  ssoTokenUrl?: string;
  ssoUserinfoUrl?: string;
  ssoUserIdField?: string;
  ssoScopes?: string;
  ssoAllowedRedirectHosts?: string;
  ssoClientId: string;
  /** Always "" from the server; sending "" keeps the stored secret. */
  ssoClientSecret: string;
  ssoTokenAuthMethod: string;
  ssoCallbackUrl: string;
  operationLogEnabled: boolean;
  operationLogMaxLinesPerFile: number;
  operationLogKeepDays: number;
  operationLogMaxTotalLines: number;
  operationLogRecordLogin: boolean;
  operationLogRecordInstance: boolean;
  operationLogRecordFile: boolean;
  operationLogRecordUser: boolean;
  operationLogRecordSystem: boolean;
  updateSourceUrl: string;
  updateSourceUrlFallback: string;
  johnnykins?: JohnnykinsPanelSwitches;
}

export const settingInfo = defineApi<undefined, Settings>({ url: "/api/overview/setting", method: "GET" });
export const setSettingInfo = defineApi<{ data: Partial<Settings> & Record<string, unknown> }, unknown>({ url: "/api/overview/setting", method: "PUT" });

export interface IUpgradeInfo {
  configured: boolean;
  currentVersion: string;
  onlineVersion?: string;
  onlineNotes?: string | Record<string, string>;
  updateAvailable: boolean;
  updateSourceUrl: string;
  error?: string;
}

export interface IUpgradeResult {
  started: boolean;
  onlineVersion?: string;
  message?: string;
}

export const getPanelUpgradeInfo = defineApi<undefined, IUpgradeInfo>({ url: "/api/upgrade/panel_info", method: "GET", timeout: 60_000 });
// Long timeout: the panel downloads and extracts the update before answering.
export const upgradePanel = defineApi<undefined, IUpgradeResult>({ url: "/api/upgrade/panel", method: "POST", timeout: 300_000 });

export const uploadAsset = defineApi<RequestConfig & { data: FormData }, string>({
  url: "/api/overview/upload_assets",
  method: "POST",
  headers: { "Content-Type": "multipart/form-data" }
});
