/**
 * Java runtime manager endpoints (port of upstream services/apis/javaManager.ts).
 * Same URLs, methods and payloads; the panel and daemon enforce authorization.
 */
import { defineApi } from "@/services/apiService";
import type { JavaRuntime } from "@/types/javaManager";

export const getJavaList = defineApi<
  {
    params: {
      daemonId: string;
      instanceId: string;
    };
  },
  JavaRuntime[]
>({
  url: "/api/java_manager/list",
  method: "GET"
});

export const addJava = defineApi<
  {
    params: {
      daemonId: string;
    };
    data: {
      name: string;
      path: string;
    };
  },
  Boolean
>({
  url: "/api/java_manager/add",
  method: "POST"
});

export const downloadJava = defineApi<
  {
    params: {
      daemonId: string;
      instanceId: string;
    };
    data: {
      name: string;
      version: string;
    };
  },
  Boolean
>({
  url: "/api/java_manager/download",
  method: "POST"
});

export const usingJava = defineApi<
  {
    params: {
      daemonId: string;
      instanceId: string;
    };
    data: {
      id: string;
    };
  },
  Boolean
>({
  url: "/api/java_manager/using",
  method: "POST"
});

export const deleteJava = defineApi<
  {
    params: {
      daemonId: string;
      instanceId: string;
    };
    data: {
      id: string;
    };
  },
  Boolean
>({
  url: "/api/java_manager/delete",
  method: "DELETE"
});
