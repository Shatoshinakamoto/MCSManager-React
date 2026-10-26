/**
 * Tests for the pure helpers of middleware/additional_security.ts (fork
 * JohnnykinsID decoding, IP normalising, CSP inline-script hashing) and of
 * the CSP that securityHeaders() sends.
 */
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../app/setting", () => ({ systemConfig: { helmet: true } }));
vi.mock("../app/service/log", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import {
  decodeDaemonServerId,
  inlineScriptHashes,
  isInertUpload,
  isPluginHostPath,
  normalizeIp,
  PLUGIN_HOST_CSP,
  securityHeaders
} from "../app/middleware/additional_security";

const hash = (s: string) => `'sha256-${crypto.createHash("sha256").update(s).digest("base64")}'`;

describe("additional security helpers", () => {
  it("decodes the fork's hex JohnnykinsID and keeps plain IPs", () => {
    const id = Buffer.from(JSON.stringify({ "6": "10.0.0.5", "1": "x" })).toString("hex");
    expect(decodeDaemonServerId(id)).toBe("10.0.0.5");
    expect(decodeDaemonServerId(" 192.168.1.2 ")).toBe("192.168.1.2");
    // Hex that is not a JohnnykinsID stays as typed (and then fails IP validation).
    expect(decodeDaemonServerId("deadbeefdeadbeefdeadbeef")).toBe("deadbeefdeadbeefdeadbeef");
  });

  it("treats IPv4-mapped IPv6 as IPv4", () => {
    expect(normalizeIp("::ffff:127.0.0.1")).toBe("127.0.0.1");
    expect(normalizeIp("::1")).toBe("::1");
  });

  it("hashes only inline scripts and inline handlers", () => {
    const html = `<script>window.a=1</script><script type="module" src="/x.js"></script><button onclick="location.reload()">r</button>`;
    expect(inlineScriptHashes(html)).toEqual({ scripts: [hash("window.a=1")], handlers: [hash("location.reload()")] });
    expect(inlineScriptHashes(`<script type="module" crossorigin src="./a.js"></script>`)).toEqual({ scripts: [], handlers: [] });
  });
});

/** Runs securityHeaders() with `html` as public/index.html and returns the CSP header. */
async function cspFor(html: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcsm-csp-"));
  fs.mkdirSync(path.join(dir, "public"));
  fs.writeFileSync(path.join(dir, "public", "index.html"), html);
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  try {
    const mw = securityHeaders();
    const headers: Record<string, string> = {};
    const ctx = {
      path: "/",
      req: { headers: {} },
      res: {
        setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = String(v)),
        removeHeader: () => undefined,
        getHeader: () => undefined
      },
      set: (k: string, v: string) => (headers[k.toLowerCase()] = String(v)),
      remove: () => undefined
    };
    await mw(ctx as never, async () => undefined);
    return headers["content-security-policy"] ?? "";
  } finally {
    cwd.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("security headers", () => {
  it("never allows eval, with or without the strict marker", async () => {
    const react = await cspFor(`<meta name="mcsm-csp" content="strict" /><script type="module" src="./a.js"></script>`);
    const other = await cspFor(`<script>window.a=1</script>`);
    expect(react).toContain("script-src 'self'");
    expect(react).not.toContain("unsafe-eval");
    expect(other).not.toContain("unsafe-eval");
    expect(other).toContain(hash("window.a=1"));
  });
});

describe("legacy plugin host and uploads", () => {
  it("serves uploaded markup and scripts as inert files", () => {
    expect(isInertUpload("/srv/web/public/upload_files/a.html")).toBe(true);
    expect(isInertUpload("/srv/web/public/upload_files/a.SVG")).toBe(true);
    expect(isInertUpload("/srv/web/public/upload_files/a.png")).toBe(false);
    expect(isInertUpload("/srv/web/public/index.html")).toBe(false);
  });

  it("keeps the plugin host sandboxed and eval-free", () => {
    expect(isPluginHostPath("/plugin-host.html")).toBe(true);
    expect(isPluginHostPath("/plugin-host.html.evil")).toBe(false);
    expect(PLUGIN_HOST_CSP).toMatch(/^sandbox allow-scripts /);
    expect(PLUGIN_HOST_CSP).not.toContain("allow-same-origin");
    expect(PLUGIN_HOST_CSP).not.toContain("allow-top-navigation");
    expect(PLUGIN_HOST_CSP).not.toContain("unsafe-eval");
  });
});
