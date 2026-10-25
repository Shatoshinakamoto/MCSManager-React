/** Layout persistence endpoints; the panel stores one JSON blob for all pages. */
import { defineApi } from "@/services/apiService";

export const getLayoutConfig = defineApi<undefined, string>({ url: "/api/overview/layout", method: "GET" });

export const setLayoutConfig = defineApi<{ data: string }, unknown>({
  url: "/api/overview/layout",
  method: "POST",
  headers: { "Content-Type": "application/json" }
});

export const resetLayoutConfig = defineApi<undefined, void>({ url: "/api/overview/layout", method: "DELETE" });
