/** Daemon (node) management endpoints; same URLs and payloads as upstream services/apis/index.ts. */
import { defineApi } from "@/services/apiService";

type Uuid = { params: { uuid: string } };

export const addNode = defineApi<{ data: Record<string, unknown> }, unknown>({ url: "/api/service/remote_service", method: "POST" });
export const editNode = defineApi<Uuid & { data: Record<string, unknown> }, unknown>({ url: "/api/service/remote_service", method: "PUT" });
export const deleteNode = defineApi<Uuid, unknown>({ url: "/api/service/remote_service", method: "DELETE" });
export const connectNode = defineApi<Uuid, unknown>({ url: "/api/service/link_remote_service", method: "GET" });

export interface UpgradeInfo {
  configured: boolean;
  currentVersion: string;
  onlineVersion?: string;
  onlineNotes?: string | Record<string, string>;
  updateAvailable: boolean;
  updateSourceUrl: string;
  error?: string;
}

export interface UpgradeResult {
  started: boolean;
  onlineVersion?: string;
  message?: string;
}

export const getDaemonUpgradeInfo = defineApi<Uuid, UpgradeInfo>({ url: "/api/upgrade/daemon_info", method: "GET", timeout: 60_000 });
export const upgradeDaemon = defineApi<Uuid, UpgradeResult>({ url: "/api/upgrade/daemon", method: "POST", timeout: 300_000 });
