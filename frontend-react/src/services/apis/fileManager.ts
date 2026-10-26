/**
 * Instance file manager endpoints (port of upstream services/apis/fileManager.ts).
 * Same URLs, methods and payloads; the panel and daemon enforce authorization.
 */
import { defineApi } from "@/services/apiService";
import type { RemoteMappingEntry } from "@/tools/protocol";

export const fileList = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
      target: string;
      page: number;
      page_size: number;
      file_name: string;
    };
  },
  {
    items: {
      name: string;
      size: number;
      time: string;
      type: number;
      mode: number;
    }[];
    page: number;
    pageSize: number;
    total: number;
    absolutePath: string;
  }
>({
  url: "/api/files/list",
  method: "GET"
});

export const getFileStatus = defineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
  },
  {
    instanceFileTask: number;
    globalFileTask: number;
    downloadFileFromURLTask: number;
    downloadTasks?: {
      taskId: string;
      path: string;
      total: number;
      current: number;
      status: number;
      error?: string;
    }[];
    platform: string;
    isGlobalInstance: boolean;
    disks: string[];
  }
>({
  url: "/api/files/status",
  method: "GET"
});

export const addFolder = defineApi<
  {
    data: {
      target: string;
    };
    params: {
      uuid: string;
      daemonId: string;
    };
  },
  boolean
>({
  url: "/api/files/mkdir",
  method: "POST"
});

export const touchFile = defineApi<
  {
    data: {
      target: string;
    };
    params: {
      uuid: string;
      daemonId: string;
    };
  },
  boolean
>({
  url: "/api/files/touch",
  method: "POST"
});

export const deleteFile = defineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
    data: {
      targets: string[];
    };
  },
  boolean
>({
  url: "/api/files",
  method: "DELETE"
});

export const copyFile = defineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
    data: {
      targets: string[][];
    };
  },
  boolean
>({
  url: "/api/files/copy",
  method: "POST"
});

export const moveFile = defineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
    data: {
      targets: string[][];
    };
  },
  boolean
>({
  url: "/api/files/move",
  method: "PUT"
});

export const compressFile = defineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
    data: {
      type: number;
      targets: string[] | string;
      source: string;
      code: string;
    };
  },
  boolean
>({
  url: "/api/files/compress",
  method: "POST",
  timeout: Number.MAX_SAFE_INTEGER
});

export const downloadFromUrl = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
    };
    data: {
      url: string;
      file_name: string;
    };
  },
  {
    error?: string;
  }
>({
  url: "/api/files/download_from_url",
  method: "POST"
});

export const downloadFromUrlStop = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
    };
    data: {
      taskId?: string;
      fileName?: string;
    };
  },
  boolean
>({
  url: "/api/files/download_from_url_stop",
  method: "POST"
});

export const uploadAddress = defineApi<
  {
    params: {
      upload_dir: string;
      daemonId: string;
      uuid: string;
      file_name?: string;
    };
  },
  {
    password: string;
    addr: string;
    remoteMappings: RemoteMappingEntry[];
  }
>({
  url: "/api/files/upload",
  method: "POST"
});

export const uploadFile = defineApi<
  {
    params:
      | {
          overwrite: boolean;
          filename: string;
          size: number;
          sum: string;
          unzip?: boolean;
          code?: string;
        }
      | { stop: boolean };
  },
  {
    id?: string;
    received?: { start: number; end: number }[];
  }
>({
  method: "POST"
});

export const uploadFilePiece = defineApi<
  {
    data: FormData;
    params: {
      offset: number;
    };
  },
  any
>({
  method: "POST",
  headers: { "Content-Type": "multipart/form-data" },
  timeout: Number.MAX_SAFE_INTEGER
});

export const downloadAddress = defineApi<
  {
    params: {
      file_name: string;
      daemonId: string;
      uuid: string;
    };
  },
  {
    password: string;
    addr: string;
    remoteMappings: RemoteMappingEntry[];
  }
>({
  url: "/api/files/download",
  method: "POST"
});

export const fileContent = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
    };
    data: {
      target: string;
      text?: string;
    };
  },
  string
>({
  url: "/api/files",
  method: "PUT",
  timeout: Number.MAX_SAFE_INTEGER
});

export const changePermission = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
    };
    data: {
      chmod: number;
      deep: boolean;
      target: string;
    };
  },
  boolean
>({
  url: "/api/files/chmod",
  method: "PUT"
});

export const changePermissionBatch = defineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
    };
    data: {
      chmod: number;
      deep: boolean;
      targets: string[];
    };
  },
  {
    success: number;
    failed: number;
    total: number;
    results: {
      target: string;
      success: boolean;
      error?: string;
    }[];
  }
>({
  url: "/api/files/chmod_batch",
  method: "PUT"
});
