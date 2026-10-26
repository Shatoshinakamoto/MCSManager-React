/**
 * Tests for the daemon HTTP hardening in service/johnnykins/http_security.ts:
 * client IP resolution that ignores spoofed forwarding headers (CWE-348),
 * the CORS allow-list, and the fixed-window limiter (CWE-770).
 */
import { describe, expect, it } from "vitest";
import { corsOriginFor, DAEMON_HTTP_CSP, FixedWindowLimiter, resolveClientIp } from "../johnnykins/http_security";

describe("daemon HTTP security", () => {
  it("uses the socket address unless the peer is a trusted proxy", () => {
    expect(resolveClientIp("203.0.113.9", "1.1.1.1", [])).toBe("203.0.113.9");
    expect(resolveClientIp("::ffff:10.0.0.2", "198.51.100.7", ["10.0.0.2"])).toBe("198.51.100.7");
    // A client-supplied first hop is skipped in favour of the nearest untrusted one.
    expect(resolveClientIp("10.0.0.2", "6.6.6.6, 198.51.100.7", ["10.0.0.2"])).toBe("198.51.100.7");
    expect(resolveClientIp("10.0.0.2", undefined, ["10.0.0.2"])).toBe("10.0.0.2");
  });

  it("keeps upstream's * while the allow-list is off and narrows it when on", () => {
    expect(corsOriginFor("https://evil.example", { cors: false, origins: [] })).toBe("*");
    expect(corsOriginFor("https://panel.example", { cors: true, origins: ["https://panel.example"] })).toBe("https://panel.example");
    expect(corsOriginFor("https://evil.example", { cors: true, origins: ["https://panel.example"] })).toBe("");
    expect(corsOriginFor("https://evil.example", { cors: true, origins: ["*"] })).toBe("");
    expect(corsOriginFor(undefined, { cors: true, origins: ["https://panel.example"] })).toBe("");
  });

  it("limits each key per window and resets afterwards", () => {
    const l = new FixedWindowLimiter();
    expect(l.take("a", 2, 1000, 0)).toBe(true);
    expect(l.take("a", 2, 1000, 10)).toBe(true);
    expect(l.take("a", 2, 1000, 20)).toBe(false);
    expect(l.take("b", 2, 1000, 20)).toBe(true);
    expect(l.take("a", 2, 1000, 1000)).toBe(true);
  });

  it("serves files inert", () => {
    expect(DAEMON_HTTP_CSP).toContain("default-src 'none'");
    expect(DAEMON_HTTP_CSP).toContain("sandbox");
  });
});

describe("daemon info page CSP", () => {
  it("pins the page's inline scripts by hash and allows nothing else", async () => {
    const { pageCspFor } = await import("../johnnykins/http_security");
    const csp = pageCspFor("<style>a{}</style><script>console.log(1)</script>");
    expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(pageCspFor("<p>no scripts</p>")).toContain("script-src 'none'");
  });
});
