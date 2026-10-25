/** Current-user account endpoints (same URLs as upstream services/apis/user.ts). */
import { defineApi, type RequestConfig } from "@/services/apiService";

export const setUserApiKey = defineApi<{ data: { enable: boolean } } & RequestConfig, string>({ url: "/api/auth/api", method: "PUT" });
export const updatePassword = defineApi<{ data: { passWord: string } }, boolean>({ url: "/api/auth/update", method: "PUT" });
export const bind2FA = defineApi<{ data: Record<string, never> }, string>({ url: "/api/auth/bind2fa", method: "POST" });
export const confirm2FA = defineApi<{ data: { enable: boolean; TOTPCode: string } }, boolean>({ url: "/api/auth/confirm2fa", method: "POST" });
