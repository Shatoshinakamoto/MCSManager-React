/**
 * Tests for the "run as" limits in tools/system_user.ts: allowed accounts,
 * no root unless allowed, root daemon required to switch accounts, default
 * user fallback, and account names that can never become `id` options
 * (CWE-250, CWE-269, CWE-88).
 */
import { describe, expect, it } from "vitest";
import { assertRunAsAllowed, effectiveRunAsName, RUN_AS_NAME_PATTERN, type RunAsPolicy } from "../system_user";

const policy = (p: Partial<RunAsPolicy> = {}): RunAsPolicy => ({ defaultUser: "", allowedUsers: [], allowRoot: false, ...p });

describe("run as policy", () => {
  it("falls back to the daemon's default user only when runAs is empty", () => {
    expect(effectiveRunAsName("", policy({ defaultUser: "mcsm" }))).toBe("mcsm");
    expect(effectiveRunAsName("  ", policy({ defaultUser: "mcsm" }))).toBe("mcsm");
    expect(effectiveRunAsName("steam", policy({ defaultUser: "mcsm" }))).toBe("steam");
    expect(effectiveRunAsName(undefined, policy())).toBe("");
  });

  it("lets a root daemon switch to an ordinary account", () => {
    expect(() => assertRunAsAllowed("steam", 1001, policy(), 0, true)).not.toThrow();
  });

  it("refuses root unless allowRoot is on", () => {
    expect(() => assertRunAsAllowed("root", 0, policy(), 0, true)).toThrow(/allowRoot/);
    expect(() => assertRunAsAllowed("root", 0, policy({ allowRoot: true }), 0, true)).not.toThrow();
  });

  it("refuses accounts outside allowedUsers", () => {
    expect(() => assertRunAsAllowed("bob", 1002, policy({ allowedUsers: ["steam"] }), 0, true)).toThrow(/allowedUsers/);
    expect(() => assertRunAsAllowed("steam", 1001, policy({ allowedUsers: ["steam"] }), 0, true)).not.toThrow();
  });

  it("refuses a switch on a non-root daemon but allows its own account", () => {
    expect(() => assertRunAsAllowed("steam", 1001, policy(), 1000, false)).toThrow(/needs the daemon to run as root/);
    expect(() => assertRunAsAllowed("me", 1000, policy(), 1000, false)).not.toThrow();
  });

  it("accepts only portable names or numeric uids", () => {
    for (const ok of ["steam", "mc_server", "_svc", "a-b", "1000"]) expect(RUN_AS_NAME_PATTERN.test(ok)).toBe(true);
    for (const bad of ["-G", "--help", "a b", "a;id", "root\n", "", "x".repeat(33), "../x"]) expect(RUN_AS_NAME_PATTERN.test(bad)).toBe(false);
  });
});

describe("folder access hint", () => {
  it("finds a folder the account cannot enter", async () => {
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const { findBlockingPath } = await import("../system_user");
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "runas-"));
    const locked = path.join(base, "locked");
    const inst = path.join(locked, "inst");
    fs.mkdirSync(inst, { recursive: true });
    fs.chmodSync(base, 0o755);
    fs.chmodSync(locked, 0o700);
    fs.chmodSync(inst, 0o777);
    const other = 65534;
    expect(findBlockingPath(inst, other, other)).toBe(locked);
    fs.chmodSync(locked, 0o711);
    expect(findBlockingPath(inst, other, other)).toBeUndefined();
    fs.chmodSync(inst, 0o755);
    expect(findBlockingPath(inst, other, other)).toBe(inst);
    fs.rmSync(base, { recursive: true, force: true });
  });
});
