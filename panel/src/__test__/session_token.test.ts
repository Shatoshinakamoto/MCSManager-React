/**
 * Tests for the anti-CSRF session token check in middleware/permission.ts:
 * header first, query fallback, constant-time match, and no match when
 * either side is missing (CWE-352, CWE-208, CWE-598).
 */
import { describe, expect, it } from "vitest";
import { readRequestToken, sessionTokenMatches } from "../app/middleware/permission";

const ctx = (header?: string, query?: unknown) =>
  ({ get: (k: string) => (k.toLowerCase() === "x-mcsm-token" ? header ?? "" : ""), query: { token: query } }) as never;

describe("session token", () => {
  it("prefers the X-MCSM-Token header and falls back to ?token=", () => {
    expect(readRequestToken(ctx("abc", "zzz"))).toBe("abc");
    expect(readRequestToken(ctx(undefined, "zzz"))).toBe("zzz");
    expect(readRequestToken(ctx(undefined, ["a", "b"]))).toBeUndefined();
  });

  it("matches only identical non-empty tokens", () => {
    expect(sessionTokenMatches("t0k3n", "t0k3n")).toBe(true);
    expect(sessionTokenMatches("t0k3n", "t0k3m")).toBe(false);
    expect(sessionTokenMatches("t0k3", "t0k3n")).toBe(false);
    expect(sessionTokenMatches(undefined, undefined)).toBe(false);
    expect(sessionTokenMatches("", "")).toBe(false);
    expect(sessionTokenMatches("x", undefined)).toBe(false);
  });
});
