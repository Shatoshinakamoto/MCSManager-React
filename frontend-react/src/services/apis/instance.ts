/**
 * Instance endpoints used by the instance list and cards. Same URLs, methods
 * and payloads as upstream services/apis/instance.ts and apis/index.ts.
 * Authorization is enforced by the panel; nothing here is a security control.
 */
import { defineApi } from "@/services/apiService";
import type { InstanceDetail, NodeStatus } from "@/types/instance";
import type { NewScheduleTask, Schedule, ScheduleAction } from "@/types/schedule";

type InstanceRef = { params: { uuid: string; daemonId: string } };
type BatchItems = { data: { instanceUuid: string; daemonId: string }[] };

export const remoteNodeList = defineApi<undefined, NodeStatus[]>({ url: "/api/service/remote_services_list", method: "GET" });

export interface InstanceListResponse {
  maxPage: number;
  page: number;
  pageSize: number;
  data: InstanceDetail[];
  allTags: string[];
}

export const remoteInstances = defineApi<
  { params: { daemonId: string; page: number; page_size: number; instance_name?: string; status?: string; tag?: string } },
  InstanceListResponse
>({ url: "/api/service/remote_service_instances", method: "GET" });

export const remoteInstancesGlobal = defineApi<
  { params: { page: number; page_size: number; instance_name?: string; status?: string } },
  Record<string, { instances: InstanceDetail[]; maxPage: number; page: number; error?: string }>
>({ url: "/api/service/remote_services_instances_global", method: "GET" });

export const getInstanceInfo = defineApi<InstanceRef, InstanceDetail>({ url: "/api/instance", method: "GET" });

export const openInstance = defineApi<InstanceRef, unknown>({ url: "/api/protected_instance/open", method: "GET" });
export const stopInstance = defineApi<InstanceRef, unknown>({ url: "/api/protected_instance/stop", method: "GET" });
export const restartInstance = defineApi<InstanceRef, unknown>({ url: "/api/protected_instance/restart", method: "GET" });
export const killInstance = defineApi<InstanceRef, unknown>({ url: "/api/protected_instance/kill", method: "GET" });
export const updateInstance = defineApi<
  { params: { uuid: string; daemonId: string; task_name: string }; data: { time: number } },
  boolean
>({ url: "/api/protected_instance/asynchronous", method: "POST" });

export const updateInstanceConfig = defineApi<InstanceRef & { data: { tag?: string[] } & Record<string, unknown> }, unknown>({
  url: "/api/protected_instance/instance_update",
  method: "PUT"
});

type ConfigFileRef = { params: { uuid: string; daemonId: string; fileName: string; type: string } };
export const getConfigFile = defineApi<ConfigFileRef, Record<string, unknown>>({ url: "/api/protected_instance/process_config/file", method: "GET" });
export const updateConfigFile = defineApi<ConfigFileRef & { data: Record<string, unknown> }, unknown>({
  url: "/api/protected_instance/process_config/file",
  method: "PUT"
});

export const batchStart = defineApi<BatchItems, boolean>({ url: "/api/instance/multi_open", method: "POST" });
export const batchStop = defineApi<BatchItems, boolean>({ url: "/api/instance/multi_stop", method: "POST" });
export const batchKill = defineApi<BatchItems, boolean>({ url: "/api/instance/multi_kill", method: "POST" });
export const batchRestart = defineApi<BatchItems, boolean>({ url: "/api/instance/multi_restart", method: "POST" });
export const batchDelete = defineApi<{ params: { daemonId: string }; data: { uuids: string[]; deleteFile: boolean } }, string[]>({
  url: "/api/instance",
  method: "DELETE"
});

export interface RemoteMappingEntry {
  from: { addr: string; prefix: string };
  to: { addr: string; prefix: string };
}

/** One-time stream credentials for the browser's direct daemon connection. */
export interface MissionPassportResponse {
  addr: string;
  password: string;
  prefix: string;
  remoteMappings: RemoteMappingEntry[];
}

export const setUpTerminalStreamChannel = defineApi<{ params: { daemonId: string; uuid: string } }, MissionPassportResponse>({
  url: "/api/protected_instance/stream_channel",
  method: "POST"
});

export const getInstanceOutputLog = defineApi<{ params: { uuid: string; daemonId: string } }, string>({
  url: "/api/protected_instance/outputlog",
  method: "GET"
});

// ---- Instance settings, config files, schedules (Phase 2) ----

export const updateAnyInstanceConfig = defineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
    data: IGlobalInstanceConfig;
  },
  {
    instanceUuid: string;
  }
>({
  url: "/api/instance",
  method: "PUT"
});

export const uploadAddress = defineApi<
  {
    params: {
      upload_dir: string;
      daemonId: string;
    };
    data: IGlobalInstanceConfig;
  },
  {
    instanceUuid: string;
    password: string;
    addr: string;
    remoteMappings: RemoteMappingEntry[];
  }
>({
  url: "/api/instance/upload",
  method: "POST"
});

export const uploadInstanceFile = defineApi<
  {
    params: {
      unzip: number;
      code: string;
    };
    data: FormData;
  },
  any
>({
  method: "POST",
  headers: { "Content-Type": "multipart/form-data" }
});

export const getConfigFileList = defineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
    data: {
      files: string[];
    };
  },
  {
    check: boolean;
    file: string;
  }[]
>({
  method: "POST",
  url: "/api/protected_instance/process_config/list"
});

export const scheduleList = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
    };
  },
  Schedule[]
>({
  method: "GET",
  url: "/api/protected_schedule"
});

export const scheduleDelete = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
      task_name: string;
    };
  },
  boolean
>({
  method: "DELETE",
  url: "/api/protected_schedule"
});

export const scheduleCreate = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
    };
    data: NewScheduleTask & { actions: ScheduleAction[] };
  },
  boolean
>({
  url: "/api/protected_schedule",
  method: "POST"
});

export const reinstallInstance = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
    };
    data: {
      targetUrl?: string;
      title: string;
      description: string;
    };
  },
  boolean
>({
  url: "/api/protected_instance/install_instance",
  method: "POST"
});

// ---- Instance creation and the app market (same URLs as upstream services/apis/instance.ts). ----
export const createInstance = defineApi<
  { params: { daemonId: string }; data: IGlobalInstanceConfig },
  { instanceUuid: string; config: IGlobalInstanceConfig }
>({ url: "/api/instance", method: "POST" });

export const quickInstallListAddr = defineApi<undefined, IQuickStartTemplate>({
  url: "/api/instance/quick_install_list",
  method: "GET"
});

/** Starts the daemon's quick_install task (download + unpack a market template into a new instance). */
export const createAsyncTask = defineApi<
  {
    params: { daemonId: string; uuid: string; task_name: string };
    data: { time: number; newInstanceName: string; targetLink?: string; setupInfo?: IGlobalInstanceConfig };
  },
  { instanceConfig: IGlobalInstanceConfig; instanceStatus: number; instanceUuid: string; status: number; taskId: string }
>({ url: "/api/protected_instance/asynchronous", method: "POST" });

/**
 * Status of a daemon async task such as quick_install (port of upstream
 * queryAsyncTask). Upstream defines it but its UI polls the task list
 * instead; kept for parity. Admin only on the panel.
 */
export const queryAsyncTask = defineApi<
  {
    params: { daemonId: string; uuid: string; task_name: string };
    data: { taskId: string };
  },
  {
    taskId: string;
    status: number;
    detail: {
      instanceConfig: IGlobalInstanceConfig;
      instanceStatus: number;
      instanceUuid: string;
      status: number;
      taskId: string;
      downloadProgress?: { percentage: number; downloadedBytes: number; totalBytes: number; speed: number; eta: number };
    };
  }
>({ url: "/api/protected_instance/query_asynchronous", method: "POST" });
