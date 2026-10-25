/**
 * Panel API endpoints used by the ported screens. Same URLs and payloads as
 * upstream frontend/src/services/apis; more are added as widgets are ported.
 */
import { defineApi, type RequestConfig } from "@/services/apiService";
import type { OverviewResponse } from "@/types/overview";
import type { OperationLoggerItem } from "@/types/operationLog";
import type { LoginUserInfo, PanelStatus, SsoPublicConfig } from "@/types";

export const panelStatus = defineApi<undefined, PanelStatus>({ url: "/api/auth/status", method: "GET" });

export const panelInstall = defineApi<{ data: { username: string; password: string } }, unknown>({
  url: "/api/auth/install",
  method: "POST"
});

export const loginUser = defineApi<{ data: { username: string; password: string; code?: string } }, string>({
  url: "/api/auth/login",
  method: "POST"
});

export const loginPageInfo = defineApi<undefined, { loginInfo: string }>({
  url: "/api/auth/login_info",
  method: "GET"
});

export const logoutUser = defineApi<undefined, unknown>({ url: "/api/auth/logout", method: "GET" });

export const userInfoApi = defineApi<undefined, LoginUserInfo>({ url: "/api/auth/", method: "GET" });

/** Same endpoint with instance status/times filled in (upstream userInfoApi with advanced: true). */
export const userInfoAdvanced = defineApi<{ params: { advanced: true } }, LoginUserInfo>({ url: "/api/auth/", method: "GET" });

export const ssoConfig = defineApi<undefined, SsoPublicConfig | null>({ url: "/api/auth/sso/config", method: "GET" });

export const overviewInfo = defineApi<RequestConfig | undefined, OverviewResponse>({ url: "/api/overview", method: "GET" });

export const getOperationLog = defineApi<{ data?: { limit?: number } } | undefined, OperationLoggerItem[]>({
  url: "/api/overview/operation_logs",
  method: "GET"
});
