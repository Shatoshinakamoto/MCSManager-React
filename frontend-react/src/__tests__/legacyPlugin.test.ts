/**
 * Security tests for the legacy plugin bridge (tools/legacyPluginBridge.ts):
 * default-deny, read-only allow-list, path normalisation, credential
 * stripping, rate limiting and plugin source validation (CWE-285, CWE-22,
 * CWE-20, CWE-770).
 */
import { describe, expect, it } from "vitest";
import {
  BridgeRateLimiter,
  checkBridgeRequest,
  isBridgeRequest,
  legacyPluginSource,
  LEGACY_READ_API,
  pluginBaseUrl,
  type BridgeRequest
} from "@/tools/legacyPluginBridge";

const req = (path: string, method = "GET", params: Record<string, string> = {}): BridgeRequest => ({ type: "mcsmanager:api", id: 1, method, path, params });

describe("checkBridgeRequest", () => {
  it("denies everything while panel data is off", () => {
    expect(checkBridgeRequest(req("/api/overview"), "none")).toMatchObject({ ok: false, status: 403 });
  });

  it("allows only GETs on the read-only list", () => {
    for (const p of LEGACY_READ_API) expect(checkBridgeRequest(req(p), "read").ok).toBe(true);
    expect(checkBridgeRequest(req("/api/overview", "POST"), "read").ok).toBe(false);
    expect(checkBridgeRequest(req("/api/overview", "DELETE"), "read").ok).toBe(false);
  });

  it.each([
    "/api/auth/overview",
    "/api/overview/../auth/overview",
    "/api/%2e%2e/auth/overview",
    "/api/overview/operation_logs",
    "/api/files/list",
    "/api/protected_instance/command",
    "//evil/api/overview",
    "/API/OVERVIEW"
  ])("blocks %s", (p) => {
    expect(checkBridgeRequest(req(p), "read").ok).toBe(false);
  });

  it("drops credential parameters and caps parameters", () => {
    const d = checkBridgeRequest(req("/api/overview", "GET", { token: "x", ApiKey: "y", page: "1" }), "read");
    expect(d).toEqual({ ok: true, path: "/api/overview", params: { page: "1" } });
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, "v"]));
    expect(checkBridgeRequest(req("/api/overview", "GET", many), "read").ok).toBe(false);
    expect(checkBridgeRequest(req("/api/overview", "GET", { q: "x".repeat(5000) }), "read").ok).toBe(false);
  });

  it("ignores malformed messages", () => {
    expect(isBridgeRequest({ type: "mcsmanager:api", id: "1", method: "GET", path: "/api/overview", params: {} })).toBe(false);
    expect(isBridgeRequest(null)).toBe(false);
    expect(isBridgeRequest(req("/api/overview"))).toBe(true);
  });
});

describe("BridgeRateLimiter", () => {
  it("refuses calls over the limit until the window passes", () => {
    const l = new BridgeRateLimiter(3, 1000);
    expect([l.take(0), l.take(1), l.take(2), l.take(3)]).toEqual([true, true, true, false]);
    expect(l.take(1001)).toBe(true);
  });
});

describe("legacyPluginSource", () => {
  it("accepts http(s) URLs and panel-uploaded .html files only", () => {
    expect(legacyPluginSource("https://plugins.example/p.html")).toBe("https://plugins.example/p.html");
    expect(legacyPluginSource("/upload_files/47a3e900-cb05-4640-896f-89b0ded75c66.html")).toBeDefined();
    for (const bad of ["/upload_files/../index.html", "/upload_files/a.png", "/api/overview", "javascript:alert(1)", "data:text/html,x", "//evil/p.html", 1])
      expect(legacyPluginSource(bad)).toBeUndefined();
  });

  it("resolves the base URL of uploads against the panel", () => {
    expect(pluginBaseUrl("/upload_files/a.html", "http://panel:23333/#/overview")).toBe("http://panel:23333/upload_files/a.html");
  });
});
