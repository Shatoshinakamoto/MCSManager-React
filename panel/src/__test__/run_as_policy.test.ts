/**
 * Tests for service/run_as_policy.ts: only a Web Admin/Owner (permission 20)
 * may set an instance's OS account; for everyone else the key is dropped, so
 * an update keeps the current value (CWE-269, NIST AC-6).
 */
import { describe, expect, it, vi } from "vitest";

const current = { user: undefined as { permission: number; userName: string } | undefined };
vi.mock("../app/service/passport_service", () => ({ getUserFromCtx: () => current.user }));
vi.mock("../app/service/log", () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

const { applyRunAsPolicy, canSetRunAs } = await import("../app/service/run_as_policy");
const ctx = {} as never;

describe("run as policy", () => {
  it("lets a Web Admin set runAs", () => {
    current.user = { permission: 20, userName: "owner" };
    const cfg = { nickname: "x", runAs: " steam " };
    expect(canSetRunAs(ctx)).toBe(true);
    expect(applyRunAsPolicy(ctx, cfg)).toBe(false);
    expect(cfg.runAs).toBe("steam");
  });

  it("drops runAs from an Admin, even with enforcement off", () => {
    current.user = { permission: 10, userName: "admin" };
    const cfg: Record<string, unknown> = { nickname: "x", runAs: "root" };
    expect(applyRunAsPolicy(ctx, cfg)).toBe(true);
    expect("runAs" in cfg).toBe(false);
    expect(cfg.nickname).toBe("x");
  });

  it("drops an empty runAs silently and ignores configs without it", () => {
    current.user = { permission: 1, userName: "user" };
    const cfg: Record<string, unknown> = { runAs: "" };
    expect(applyRunAsPolicy(ctx, cfg)).toBe(false);
    expect("runAs" in cfg).toBe(false);
    expect(applyRunAsPolicy(ctx, { nickname: "y" })).toBe(false);
    expect(applyRunAsPolicy(ctx, null)).toBe(false);
  });

  it("refuses when nobody is logged in", () => {
    current.user = undefined;
    expect(canSetRunAs(ctx)).toBe(false);
  });
});
