/**
 * Instance and daemon list types (port of upstream frontend/src/types/index.ts
 * and types/const.ts). `IGlobalInstanceConfig` comes from common/global.d.ts,
 * the same declaration the panel and daemon use, so the shapes cannot drift.
 */
import { t } from "@/lang/i18n";

export enum INSTANCE_STATUS_CODE {
  BUSY = -1,
  STOPPED = 0,
  STOPPING = 1,
  STARTING = 2,
  RUNNING = 3
}

/** Status labels. A function so translations resolve after i18n init. */
export const instanceStatusLabels = (): Record<INSTANCE_STATUS_CODE, string> => ({
  [INSTANCE_STATUS_CODE.BUSY]: t("TXT_CODE_342a04a9"),
  [INSTANCE_STATUS_CODE.STOPPED]: t("TXT_CODE_15f2e564"),
  [INSTANCE_STATUS_CODE.STOPPING]: t("TXT_CODE_a409b8a9"),
  [INSTANCE_STATUS_CODE.STARTING]: t("TXT_CODE_175b570d"),
  [INSTANCE_STATUS_CODE.RUNNING]: t("TXT_CODE_bdb620b9")
});

export interface InstanceRuntimeInfo {
  mcPingOnline: boolean;
  currentPlayers: number;
  maxPlayers: number;
  version: string;
  fileLock: number;
  playersChart: { value: string }[];
  openFrpStatus: boolean;
  latency: number;
  cpuUsage?: number;
  memoryUsagePercent?: number;
  rxBytes?: number;
  txBytes?: number;
  rxRate?: number;
  txRate?: number;
  networkInterfaces?: string[];
  networkStatsSource?: "docker";
  readBytes?: number;
  writeBytes?: number;
  memoryUsage?: number;
  memoryLimit?: number;
  storageUsage?: number;
  storageLimit?: number;
  allocatedPorts?: { host: string; container: number; protocol: string }[];
}

export interface InstanceDetail {
  instanceUuid: string;
  started: number;
  autoRestarted: number;
  status: INSTANCE_STATUS_CODE;
  info: InstanceRuntimeInfo;
  config: IGlobalInstanceConfig;
  watcher?: number;
}

export interface InstanceMoreDetail extends InstanceDetail {
  moreInfo?: {
    isRunning: boolean;
    isStopped: boolean;
    instanceTypeText: string;
    statusText: string;
  };
}

export interface NodeStatus {
  available: boolean;
  ip: string;
  port: number;
  remarks: string;
  uuid: string;
}
