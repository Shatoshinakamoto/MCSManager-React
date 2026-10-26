/**
 * Daemon HTTP hardening, ported from the Johnnykins fork's daemon
 * service/http.ts and app.ts: security headers (fork: koa-helmet), a CORS
 * allow-list (fork: cors + origin/origins), a per-IP rate limiter (fork:
 * koa-ratelimit, 20 requests per 10 s) and the PandorasWall middleware lock.
 *
 * The daemon's HTTP server only carries file uploads and downloads, each of
 * which needs a one-time passport issued by the panel. Settings live in
 * `johnnykins.http` and `johnnykins.pandorasWall` of data/Config/global.json
 * and are documented in docs/configuration/daemon-johnnykins.md.
 *
 * What changed from the fork, and why:
 * - The fork keyed the rate limiter on a hex dump of Cloudflare and
 *   X-Forwarded-For headers, which any client can send, so a fresh id per
 *   request bypassed the limit (CWE-290, CWE-348). Here the key is the socket
 *   address; X-Forwarded-For is read only from `johnnykins.ban.trustedProxies`.
 * - The fork's CORS fallback answered `*` for unknown origins even with the
 *   allow-list on. Here an unknown origin gets no CORS header.
 * - No new packages: the headers and the limiter are a few lines each, which
 *   keeps the daemon's dependency tree (and its supply-chain surface) as is.
 * - The fork's PandorasWall compared two `Symbol()` values, which never
 *   match, so it never engaged. This version freezes the middleware list.
 *
 * SECURITY: OWASP ASVS V14.4 (HTTP security headers), NIST SC-5 (denial of
 * service protection), CWE-770 (resource allocation without limits).
 */
import { createHash } from "crypto";
import Koa from "koa";
import { globalConfiguration } from "../../entity/config";
import logger from "../log";

export interface DaemonHttpSecurityConfig {
  securityHeaders: boolean;
  cors: boolean;
  origins: string[];
  rateLimiter: boolean;
  rateLimitMax: number;
  rateLimitDurationMs: number;
}

export const DEFAULT_HTTP_SECURITY: DaemonHttpSecurityConfig = {
  securityHeaders: true,
  cors: false,
  origins: [],
  rateLimiter: false,
  rateLimitMax: 120,
  rateLimitDurationMs: 10000
};

/**
 * CSP for every daemon HTTP response. Downloads are files, not pages: a
 * downloaded .html or .svg opened in the browser runs nothing and cannot be
 * framed (CWE-79, CWE-1021).
 */
export const DAEMON_HTTP_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox";

/**
 * CSP for the daemon's own information page (const/index_html.ts): its inline
 * styles may apply and only its exact inline scripts may run, pinned by
 * SHA-256. Everything else stays blocked.
 */
export function pageCspFor(html: string): string {
  const hashes = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((m) => `'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`)
    .join(" ");
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `script-src ${hashes || "'none'"}`,
    "img-src data:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join("; ");
}

function cfg(): DaemonHttpSecurityConfig {
  return { ...DEFAULT_HTTP_SECURITY, ...(globalConfiguration.config.johnnykins?.http ?? {}) };
}

/** IPv4-mapped IPv6 ("::ffff:1.2.3.4") and plain IPv4 compare equal. */
export function normalizeIp(ip: string): string {
  const v = String(ip || "").trim();
  return v.startsWith("::ffff:") ? v.slice(7) : v;
}

/**
 * The client address: the socket peer, or, when the peer is a trusted proxy,
 * the nearest X-Forwarded-For hop that is not a trusted proxy.
 */
export function resolveClientIp(peer: string, forwardedFor: string | string[] | undefined, trustedProxies: string[]): string {
  const p = normalizeIp(peer);
  const trusted = (trustedProxies || []).map(normalizeIp);
  if (!trusted.includes(p)) return p;
  const hops = String(Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor || "")
    .split(",")
    .map(normalizeIp)
    .filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i--) if (!trusted.includes(hops[i])) return hops[i];
  return p;
}

/** Security headers on every response while `securityHeaders` is on. */
export function daemonSecurityHeaders(): Koa.Middleware {
  return async (ctx, next) => {
    await next();
    if (!cfg().securityHeaders) return;
    // A route may name a page CSP in ctx.state.daemonCsp (only the info page does).
    ctx.set("Content-Security-Policy", typeof ctx.state.daemonCsp === "string" ? ctx.state.daemonCsp : DAEMON_HTTP_CSP);
    ctx.set("X-Content-Type-Options", "nosniff");
    ctx.set("X-Frame-Options", "DENY");
    ctx.set("Referrer-Policy", "no-referrer");
    ctx.set("Cross-Origin-Opener-Policy", "same-origin");
    // Fork: hidePoweredBy.
    ctx.remove("X-Power-by");
  };
}

/**
 * The Access-Control-Allow-Origin value for a request: upstream's `*` while
 * the allow-list is off; the exact origin, or nothing, while it is on.
 */
export function corsOriginFor(requestOrigin: string | undefined, c: Pick<DaemonHttpSecurityConfig, "cors" | "origins">): string {
  if (!c.cors) return "*";
  const allowed = (c.origins || []).map((o) => String(o).trim()).filter((o) => o && o !== "*");
  return requestOrigin && allowed.includes(requestOrigin) ? requestOrigin : "";
}

/** Runs after upstream's CORS headers and narrows them while the allow-list is on. */
export function daemonCorsAllowList(): Koa.Middleware {
  return async (ctx, next) => {
    await next();
    const c = cfg();
    if (!c.cors) return;
    const value = corsOriginFor(ctx.get("Origin") || undefined, c);
    if (value) {
      ctx.set("Access-Control-Allow-Origin", value);
      ctx.vary("Origin");
    } else {
      ctx.remove("Access-Control-Allow-Origin");
    }
  };
}

/** Fixed-window counter per key; small enough to unit-test without Koa. */
export class FixedWindowLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  /** Returns false when `key` is over `max` requests in the current window. */
  take(key: string, max: number, windowMs: number, now = Date.now()): boolean {
    const e = this.hits.get(key);
    if (!e || e.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      if (this.hits.size > 10000) this.sweep(now);
      return true;
    }
    e.count++;
    return e.count <= max;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}

/** Per-IP request limit while `rateLimiter` is on; over the limit answers 429. */
export function daemonRateLimiter(): Koa.Middleware {
  const limiter = new FixedWindowLimiter();
  return async (ctx, next) => {
    const c = cfg();
    if (!c.rateLimiter) return next();
    const max = Math.min(Math.max(Math.floor(Number(c.rateLimitMax) || 120), 1), 100000);
    const windowMs = Math.min(Math.max(Math.floor(Number(c.rateLimitDurationMs) || 10000), 1000), 86400000);
    const ip = resolveClientIp(ctx.req.socket.remoteAddress || "", ctx.get("X-Forwarded-For") || undefined, globalConfiguration.config.johnnykins?.ban?.trustedProxies ?? []);
    if (!limiter.take(ip, max, windowMs)) {
      ctx.status = 429;
      ctx.body = "Rate limit exceeded. Please try again later.";
      return;
    }
    return next();
  };
}

/** PandorasWall: once startup is done, no code can add HTTP middleware. */
export function lockDaemonMiddlewareStack(app: Koa) {
  if (!globalConfiguration.config.johnnykins?.pandorasWall) return;
  Object.freeze(app.middleware);
  app.use = function lockedUse() {
    logger.warn("[PandorasWall] Blocked an attempt to add HTTP middleware after startup.");
    return app;
  } as Koa["use"];
  logger.info("[PandorasWall] Daemon HTTP middleware stack locked.");
}
