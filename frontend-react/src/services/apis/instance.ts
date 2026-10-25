/**
 * Instance endpoints used by the instance list and cards. Same URLs, methods
 * and payloads as upstream services/apis/instance.ts and apis/index.ts.
 * Authorization is enforced by the panel; nothing here is a security control.
 */
import { defineApi } from "@/services/apiService";
import type { InstanceDetail, NodeStatus } from "@/types/instance";

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
