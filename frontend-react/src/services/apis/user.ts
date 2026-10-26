/** Account endpoints: the current user's own settings and admin user management (same URLs as upstream). */
import { defineApi, type RequestConfig } from "@/services/apiService";
import type { BaseUserInfo, UserInstance } from "@/types";

export const setUserApiKey = defineApi<{ data: { enable: boolean } } & RequestConfig, string>({ url: "/api/auth/api", method: "PUT" });
export const updatePassword = defineApi<{ data: { passWord: string } }, boolean>({ url: "/api/auth/update", method: "PUT" });
export const bind2FA = defineApi<{ data: Record<string, never> }, string>({ url: "/api/auth/bind2fa", method: "POST" });
export const confirm2FA = defineApi<{ data: { enable: boolean; TOTPCode: string } }, boolean>({ url: "/api/auth/confirm2fa", method: "POST" });

// ---- User management (admin). Same URLs and payloads as upstream services/apis/index.ts. ----

export interface UserSearchResult {
  total: number;
  pageSize: number;
  page: number;
  maxPage: number;
  data: BaseUserInfo[];
}

/** Editable user fields; passWord is only sent when the admin types a new one. */
export type EditUserInfo = BaseUserInfo & { passWord?: string };

export const searchUsers = defineApi<
  { params: { userName: string; page: number; page_size: number; role: string } },
  UserSearchResult
>({ url: "/api/auth/search", method: "GET" });
export const deleteUsers = defineApi<{ data: string[] }, unknown>({ url: "/api/auth", method: "DELETE" });
export const addUser = defineApi<{ data: { username: string; password: string; permission: number } }, { uuid: string }>({
  url: "/api/auth",
  method: "POST"
});
/** `true`, or the node steps the panel had to skip (an offline node while unlinking an OS account). */
export type EditUserResult = true | { warnings: string[] };
/** Node steps the panel skipped while saving a user edit, for a warning toast. */
export function osAccountWarnings(res: EditUserResult | undefined): string[] {
  return res && typeof res === "object" && Array.isArray(res.warnings) ? res.warnings.map(String) : [];
}
export const editUserInfo = defineApi<{ data: { config: Partial<EditUserInfo>; uuid: string } }, EditUserResult>({
  url: "/api/auth",
  method: "PUT"
});
export const updateUserInstance = defineApi<{ data: { config: { instances: UserInstance[] }; uuid: string } }, EditUserResult>({
  url: "/api/auth",
  method: "PUT"
});
/** Another user's info (admin only); `advanced` fills instance status and names. */
export const userInfoByUuid = defineApi<{ params: { uuid: string; advanced: boolean } }, BaseUserInfo>({
  url: "/api/auth/",
  method: "GET"
});
export const ssoUnbind = defineApi<{ data: { uuid: string } }, boolean>({ url: "/api/auth/sso/unbind", method: "PUT" });
