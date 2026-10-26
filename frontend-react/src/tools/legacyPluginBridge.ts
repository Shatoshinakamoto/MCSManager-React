/**
 * Panel side of the legacy plugin bridge (see public/plugin-host.html).
 *
 * Old upstream plugins ran in the panel page and called the panel API with
 * `window.$axios`. They now run in the sandboxed plugin host, which forwards
 * panel calls here as messages. This module decides what is answered.
 *
 * SECURITY:
 * - Default is no panel access: every request is answered 403 unless an admin
 *   turned on "read-only panel data" for that card (CWE-285).
 * - Even then only GET requests to a fixed list of read-only endpoints pass;
 *   writes, settings, users, files and terminals never do (NIST AC-6).
 * - Requests run with the viewing user's own session, so a plugin can never
 *   see more than that user can; the panel still checks every request.
 * - Caller-supplied token/API-key parameters are dropped so a plugin cannot
 *   act under another credential, and parameter count and size are capped
 *   (CWE-20). A per-card rate limit stops a plugin flooding the panel (CWE-770).
 * - Plugin HTML is fetched without credentials from other sites, and from the
 *   panel only as an uploaded .html file, size-capped (CWE-400).
 */

/** GET endpoints a plugin with "read-only panel data" may call. */
export const LEGACY_READ_API = new Set<string>([
  "/api/overview",
  "/api/service/remote_services_list",
  "/api/service/remote_services_system",
  "/api/service/remote_services",
  "/api/service/remote_service_instances",
  "/api/instance"
]);

export type PluginApiAccess = "none" | "read";

export const MAX_PLUGIN_HTML_BYTES = 2 * 1024 * 1024;
const MAX_PARAMS = 20;
const MAX_PARAM_LENGTH = 2000;
const BLOCKED_PARAM = /^(token|apikey|api_key|_force)$/i;

/** A same-origin uploaded plugin, as upstream stored them. */
const UPLOADED_PLUGIN = /^\/upload_files\/[A-Za-z0-9-]+\.html?$/;

export interface BridgeRequest {
  type: "mcsmanager:api";
  id: number;
  method: string;
  path: string;
  params: Record<string, string>;
}

export type BridgeDecision = { ok: true; path: string; params: Record<string, string> } | { ok: false; status: number; message: string };

/** Shape check for messages from the plugin frame; anything else is ignored. */
export function isBridgeRequest(m: unknown): m is BridgeRequest {
  if (!m || typeof m !== "object") return false;
  const r = m as Record<string, unknown>;
  return r.type === "mcsmanager:api" && Number.isSafeInteger(r.id) && typeof r.method === "string" && typeof r.path === "string" && !!r.params && typeof r.params === "object";
}

/** Decides whether a bridged request may run, and with which parameters. */
export function checkBridgeRequest(req: BridgeRequest, access: PluginApiAccess): BridgeDecision {
  if (access !== "read") return { ok: false, status: 403, message: "This plugin card has no panel data access." };
  if (req.method.toUpperCase() !== "GET") return { ok: false, status: 403, message: "Plugins may only read panel data." };
  // Normalise before matching so "/api/overview/../users" or encoded tricks cannot pass.
  let path: string;
  try {
    path = new URL(req.path, "http://panel.invalid").pathname.replace(/\/+$/, "");
  } catch {
    return { ok: false, status: 400, message: "Bad path." };
  }
  if (path !== req.path.replace(/\/+$/, "") || !LEGACY_READ_API.has(path))
    return { ok: false, status: 403, message: "This panel API is not available to plugins." };
  const params: Record<string, string> = {};
  const entries = Object.entries(req.params);
  if (entries.length > MAX_PARAMS) return { ok: false, status: 400, message: "Too many parameters." };
  for (const [k, v] of entries) {
    if (typeof v !== "string" || v.length > MAX_PARAM_LENGTH || k.length > 100) return { ok: false, status: 400, message: "Bad parameter." };
    if (BLOCKED_PARAM.test(k)) continue;
    params[k] = v;
  }
  return { ok: true, path, params };
}

/** Sliding-window limiter: at most `max` calls per `windowMs`. */
export class BridgeRateLimiter {
  private stamps: number[] = [];
  constructor(
    private readonly max = 30,
    private readonly windowMs = 10_000
  ) {}
  take(now = Date.now()): boolean {
    this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }
}

/**
 * Where a legacy plugin's HTML may come from: an absolute http(s) URL, or a
 * panel-uploaded .html file. Returns the URL to fetch, or undefined.
 */
export function legacyPluginSource(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (UPLOADED_PLUGIN.test(u)) return u;
  return undefined;
}

/** True when the source is a panel upload, which only the legacy host can run. */
export const isUploadedPlugin = (url: string) => UPLOADED_PLUGIN.test(url.trim());

/** Fetches plugin HTML with a size cap; panel uploads with the session, other sites without credentials. */
export async function fetchPluginHtml(source: string): Promise<string> {
  const uploaded = isUploadedPlugin(source);
  const url = uploaded ? "." + source : source;
  const res = await fetch(url, { credentials: uploaded ? "same-origin" : "omit", referrerPolicy: "no-referrer", cache: "no-cache" });
  if (!res.ok) throw new Error(`Plugin download failed (HTTP ${res.status})`);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_PLUGIN_HTML_BYTES) throw new Error("Plugin file is too large");
  const text = await res.text();
  if (new Blob([text]).size > MAX_PLUGIN_HTML_BYTES) throw new Error("Plugin file is too large");
  return text;
}

/** Absolute base URL for resolving the plugin's relative links inside the host frame. */
export function pluginBaseUrl(source: string, panelHref: string): string {
  return new URL(isUploadedPlugin(source) ? "." + source : source, panelHref).toString();
}
