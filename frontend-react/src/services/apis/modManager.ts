/**
 * Mod / plugin manager endpoints (port of upstream services/apis/modManager.ts).
 * Same URLs, methods and payloads; the panel and daemon enforce authorization.
 */
import { defineApi } from "@/services/apiService";

export const getMcVersionsApi = defineApi<{}, string[]>({
  method: "GET",
  url: "/api/mod/mc_versions"
});

export const modListApi = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
      page?: number;
      pageSize?: number;
      folder?: string;
      search?: string;
    };
  },
  {
    mods: any[];
    folders: string[];
    total: number;
    page: number;
    pageSize: number;
  }
>({
  method: "GET",
  url: "/api/mod/list"
});

export const toggleModApi = defineApi<
  {
    data: {
      daemonId: string;
      uuid: string;
      fileName: string;
      deferred?: boolean;
    };
  },
  boolean
>({
  method: "POST",
  url: "/api/mod/toggle"
});

export const deleteModApi = defineApi<
  {
    data: {
      daemonId: string;
      uuid: string;
      fileName: string;
      deferred?: boolean;
    };
  },
  boolean
>({
  method: "POST",
  url: "/api/mod/delete"
});

export const getModInfoApi = defineApi<
  {
    params: {
      hash: string;
    };
  },
  any
>({
  method: "GET",
  url: "/api/mod/info"
});

export const getModBatchInfoApi = defineApi<
  {
    data: {
      hashes: string[];
    };
  },
  Record<string, any>
>({
  method: "POST",
  url: "/api/mod/batch_info"
});

export const searchModsApi = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
      query: string;
      source?: string;
      version?: string;
      type?: string;
      loader?: string;
      environment?: string;
      offset?: number;
      limit?: number;
    };
  },
  any
>({
  method: "GET",
  url: "/api/mod/search"
});

export const getModVersionsApi = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
      projectId: string;
      source?: string;
    };
  },
  any[]
>({
  method: "GET",
  url: "/api/mod/versions"
});

export const downloadModApi = defineApi<
  {
    data: {
      daemonId: string;
      uuid: string;
      url: string;
      fileName: string;
      projectType?: string;
      fallbackUrl?: string;
      /** Upstream also sends these: queue the action until the server stops, and project metadata. */
      deferred?: boolean;
      extraInfo?: Record<string, unknown>;
    };
  },
  boolean
>({
  method: "POST",
  url: "/api/mod/download"
});

export const stopTransferApi = defineApi<
  {
    data: {
      daemonId: string;
      uuid: string;
      fileName: string;
      type: "download" | "upload";
      uploadId?: string;
    };
  },
  boolean
>({
  method: "POST",
  url: "/api/mod/stop_transfer"
});

export const getModConfigFilesApi = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
      modId: string;
      type: string;
      fileName?: string;
    };
  },
  any[]
>({
  method: "GET",
  url: "/api/mod/config_files"
});
