/**
 * Additional Security middleware (ported from the Johnnykins fork's app.ts):
 * security headers (helmet), a CORS allow-list, a per-IP API rate limiter
 * with a daemon allow-list, an absolute login lifetime bound to the login IP
 * (fork: sessionExpirationCheck), and a middleware-stack lock (a working
 * rewrite of the fork's PandorasWall).
 *
 * Every switch lives in SystemConfig (entity/setting.ts) under the fork's key
 * names and is documented in docs/configuration/panel-additional-security.md.
 *
 * SECURITY:
 * - Client IPs come from Koa's ctx.ip, which honours X-Real-IP / the
 *   configured header only when reverseProxyMode is on. The fork read
 *   X-Forwarded-For, CF-Connecting-IP and True-Client-IP unconditionally, so a
 *   client could claim a whitelisted daemon address and skip the limiter
 *   (CWE-290, CWE-348). That is not repeated here.
 * - The CSP allows scripts only from the panel's own origin, plus the exact
 *   inline scripts in the shipped public/index.html, pinned by SHA-256 hash
 *   (the Vue loading screen has one; the React build has none). Styles need
 *   'unsafe-inline' because antd injects CSS at runtime.
 * - public/plugin-host.html (legacy plugin host) gets PLUGIN_HOST_CSP instead:
 *   a CSP `sandbox` keeps it in an opaque origin, inline plugin scripts may
 *   run, eval may not. Uploaded markup/script files are served as inert text.
 * - The CSP never allows 'unsafe-eval' (CWE-95). The shipped React build
 *   needs no eval and carries <meta name="mcsm-csp" content="strict">. The
 *   old Vue build compiled i18n messages with new Function() and used to get
 *   an eval fallback; that fallback was removed at the Phase 4 cutover. A
 *   frontend without the marker only triggers a startup warning.
 * - This hardens the panel; it does not by itself make a deployment
 *   compliant with any STIG or benchmark.
 */
import cors from "@koa/cors";
import crypto from "crypto";
import fs from "fs";
import Koa from "koa";
import path from "path";
import helmet from "koa-helmet";
import ratelimit from "koa-ratelimit";
import { logger } from "../service/log";
import { systemConfig } from "../setting";

type Next = () => Promise<unknown>;

/**
 * The fork stored daemonServerIDs as hex-encoded JSON "JohnnykinsID" objects
 * whose key "6" is the socket address. Accept those for migration, plus plain
 * IP strings.
 */
export function decodeDaemonServerId(id: string): string {
  const value = String(id ?? "").trim();
  if (/^[0-9a-f]+$/i.test(value) && value.length % 2 === 0 && value.length > 16) {
    try {
      const parsed = JSON.parse(Buffer.from(value, "hex").toString("utf8"));
      if (parsed && typeof parsed === "object" && typeof parsed["6"] === "string") return parsed["6"];
    } catch {
      /* not a JohnnykinsID: fall through and treat it as an address */
    }
  }
  return value;
}

/** IPv4-mapped IPv6 ("::ffff:1.2.3.4") and plain IPv4 compare equal. */
export function normalizeIp(ip: string): string {
  const v = String(ip ?? "").trim().toLowerCase();
  return v.startsWith("::ffff:") && v.includes(".") ? v.slice(7) : v;
}

export function isWhitelistedDaemon(ip: string): boolean {
  const list = Array.isArray(systemConfig?.daemonServerIDs) ? systemConfig!.daemonServerIDs : [];
  const target = normalizeIp(ip);
  return list.some((id) => normalizeIp(decodeDaemonServerId(id)) === target);
}

const sha256 = (text: string) => `'sha256-${crypto.createHash("sha256").update(text, "utf8").digest("base64")}'`;

/**
 * CSP hash sources for the inline <script> blocks and inline event handlers
 * of the served index.html, read once at startup. Anything else inline,
 * including injected markup, stays blocked.
 */
export function inlineScriptHashes(indexHtml: string) {
  const scripts: string[] = [];
  const handlers: string[] = [];
  const scriptRe = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  const handlerRe = /\son[a-z]+\s*=\s*"([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(indexHtml))) if (m[1].trim()) scripts.push(sha256(m[1]));
  while ((m = handlerRe.exec(indexHtml))) handlers.push(sha256(m[1]));
  return { scripts: [...new Set(scripts)], handlers: [...new Set(handlers)] };
}

function readIndexHtml(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "index.html"), "utf8");
  } catch {
    return "";
  }
}

/** Upload types that must never render as active content on the panel origin. */
const INERT_UPLOAD_EXT = /\.(html?|xhtml|svg|xml|js|mjs)$/i;

/** True for markup/script files under public/upload_files (see app.ts koaStatic). */
export function isInertUpload(filePath: string): boolean {
  const parts = path.normalize(filePath).split(path.sep);
  return parts.includes("upload_files") && INERT_UPLOAD_EXT.test(filePath);
}

/**
 * CSP for public/plugin-host.html, the legacy plugin host. Plugins are
 * scripts, so inline and http(s) scripts may run, but never eval, and the
 * `sandbox` directive (without allow-same-origin) keeps the page in an opaque
 * origin even when opened directly instead of through the plugin card.
 */
export const PLUGIN_HOST_CSP = [
  "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox",
  "default-src 'none'",
  "script-src 'unsafe-inline' http: https:",
  "style-src 'unsafe-inline' http: https:",
  "img-src http: https: data: blob:",
  "font-src http: https: data:",
  "media-src http: https: data: blob:",
  "connect-src http: https: ws: wss:",
  "frame-src http: https:",
  "form-action http: https:",
  "base-uri http: https:",
  "frame-ancestors 'self'"
].join("; ");

export const isPluginHostPath = (p: string) => p === "/plugin-host.html" || p.endsWith("/plugin-host.html");

/** helmet with a CSP that fits the panel UI; skipped per request while `helmet` is off. */
export function securityHeaders(): Koa.Middleware {
  const indexHtml = readIndexHtml();
  const inline = inlineScriptHashes(indexHtml);
  const strict = /<meta\s+name="mcsm-csp"\s+content="strict"/i.test(indexHtml);
  if (!strict && indexHtml)
    logger.warn("[Helmet] public/index.html is not the React build. The CSP forbids eval, so a UI that needs it will not load while helmet is on.");
  const headers = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...inline.scripts],
        scriptSrcAttr: inline.handlers.length ? ["'unsafe-hashes'", ...inline.handlers] : ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // Market and mod images, user-set logos and data: placeholders come from anywhere.
        imgSrc: ["'self'", "data:", "blob:", "http:", "https:"],
        // Daemons are other hosts (HTTP file transfer, WebSocket terminal).
        connectSrc: ["'self'", "http:", "https:", "ws:", "wss:"],
        fontSrc: ["'self'", "data:"],
        mediaSrc: ["'self'", "blob:", "http:", "https:"],
        objectSrc: ["'none'"],
        // Iframe cards in custom layouts embed external pages.
        frameSrc: ["'self'", "http:", "https:"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"]
      }
    },
    // The panel is often reached over plain HTTP on a LAN; HSTS is left to the TLS front end.
    strictTransportSecurity: false,
    // COEP/COOP would block cross-origin daemon images and popups the UI relies on.
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "same-origin" }
  });
  return async (ctx, next) => {
    // The plugin host always gets its own sandboxing policy, even with helmet off.
    if (isPluginHostPath(ctx.path)) {
      await next();
      ctx.set("Content-Security-Policy", PLUGIN_HOST_CSP);
      ctx.set("X-Content-Type-Options", "nosniff");
      ctx.set("Referrer-Policy", "no-referrer");
      ctx.set("Cache-Control", "no-cache");
      return;
    }
    if (!systemConfig?.helmet) return next();
    return headers(ctx, next as Next);
  };
}

/** CORS allow-list from `origin` (comma-separated); skipped while `cors` is off. */
export function corsAllowList(): Koa.Middleware {
  const handler = cors({
    origin: (ctx) => {
      const requestOrigin = String(ctx.request.header.origin ?? "");
      const allowed = String(systemConfig?.origin ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      // Empty string = no Access-Control-Allow-Origin header, so the browser blocks the call.
      return allowed.includes(requestOrigin) ? requestOrigin : "";
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });
  return async (ctx, next) => {
    if (!systemConfig?.cors) return next();
    return handler(ctx, next as Next);
  };
}

/** Per-IP limit on /api requests; whitelisted daemon IPs skip it. */
export function apiRateLimiter(): Koa.Middleware {
  const db = new Map();
  let limiter: Koa.Middleware | undefined;
  let built = "";
  return async (ctx, next) => {
    if (!systemConfig?.rateLimiter || !ctx.path.startsWith("/api/")) return next();
    if (isWhitelistedDaemon(ctx.ip)) return next();
    const max = Math.max(1, Number(systemConfig.rateLimitMax) || 20);
    const duration = Math.max(1000, Number(systemConfig.rateLimitDuration) || 10000);
    // Rebuild when the settings change so the pane applies without a restart.
    const key = `${max}:${duration}`;
    if (!limiter || built !== key) {
      limiter = ratelimit({
        driver: "memory",
        db,
        duration,
        max,
        id: (c) => normalizeIp(c.ip),
        errorMessage: "Rate limit exceeded. Please try again later.",
        disableHeader: false
      });
      built = key;
    }
    return limiter(ctx, next as Next);
  };
}

/**
 * Absolute login lifetime, bound to the IP that logged in (fork:
 * sessionExpirationCheck, which kept an IP-keyed store and dropped logins
 * after one hour). The session is cleared, not the request refused, so the
 * route's own permission check then answers 403 and the UI shows the login page.
 */
export function sessionLifetime(): Koa.Middleware {
  return async (ctx, next) => {
    const minutes = Number(systemConfig?.sessionMaxAgeMinutes) || 0;
    const session = ctx.session;
    if (minutes > 0 && session?.["login"] === true) {
      const loginAt = Number(session["loginAt"]) || 0;
      const loginIp = String(session["loginIp"] ?? "");
      const expired = !loginAt || Date.now() - loginAt > minutes * 60 * 1000;
      const moved = loginIp !== "" && normalizeIp(loginIp) !== normalizeIp(ctx.ip);
      if (expired || moved) {
        logger.info(`[Session] Login of ${session["userName"]} ended: ${expired ? "lifetime reached" : "IP changed"}.`);
        session["login"] = null;
        session["userName"] = null;
        session["uuid"] = null;
        session["token"] = null;
        session["loginAt"] = null;
        session["loginIp"] = null;
      }
    }
    return next();
  };
}

/**
 * PandorasWall rewrite: once startup is done, no code can add middleware to
 * the panel (the fork's intent was to stop injected code from hooking the
 * web app; its Symbol comparison never matched, so it never engaged).
 */
export function lockMiddlewareStack(app: Koa) {
  if (!systemConfig?.pandorasWall) return;
  Object.freeze(app.middleware);
  app.use = function lockedUse() {
    logger.warn("[PandorasWall] Blocked an attempt to add middleware after startup.");
    return app;
  } as Koa["use"];
  logger.info("[PandorasWall] Middleware stack locked.");
}
