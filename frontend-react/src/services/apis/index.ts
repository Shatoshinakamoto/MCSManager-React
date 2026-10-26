/**
 * Panel API endpoints used by the ported screens. Same URLs and payloads as
 * upstream frontend/src/services/apis; more are added as widgets are ported.
 */
import { defineApi, type RequestConfig } from "@/services/apiService";
import type { OverviewResponse } from "@/types/overview";
import type { OperationLogQueryResult, OperationLoggerItem } from "@/types/operationLog";
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
/** SSO first-login binding (views/SsoBind.tsx). The pending SSO identity lives in the session. */
export const ssoBindStatus = defineApi<undefined, { pending: boolean } | null>({ url: "/api/auth/sso/bind-status", method: "GET" });
export const ssoBindLogin = defineApi<{ data: { username: string; password: string; code?: string } }, string>({
  url: "/api/auth/sso/bind",
  method: "POST"
});
export const ssoBindCurrent = defineApi<undefined, boolean>({ url: "/api/auth/sso/bind-current", method: "POST" });

export const overviewInfo = defineApi<RequestConfig | undefined, OverviewResponse>({ url: "/api/overview", method: "GET" });

export const getOperationLog = defineApi<{ data?: { limit?: number } } | undefined, OperationLoggerItem[]>({
  url: "/api/overview/operation_logs",
  method: "GET"
});

export const searchOperationLog = defineApi<
  {
    params: {
      page: number;
      page_size: number;
      type?: string;
      level?: string;
      operator_name?: string;
      start_time?: number;
      end_time?: number;
      keyword?: string;
    };
  },
  OperationLogQueryResult
>({ url: "/api/overview/operation_logs/search", method: "GET" });
