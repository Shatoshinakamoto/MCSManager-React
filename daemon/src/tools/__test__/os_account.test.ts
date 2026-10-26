/**
 * Tests for tools/os_account.ts and tools/windows_acl.ts: accepted account
 * names (no numeric ids, no shell syntax; CWE-78, CWE-88), the binding limits
 * (never root, allowed accounts, root daemon; CWE-250, CWE-269), workspace
 * containment, the parent-folder check, and the Windows lookup and icacls
 * calls with a mocked process runner (account SIDs only; CWE-732).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { assertBindingAllowed, blockingAncestor, isStrictlyBelow, isValidOsAccountName, pathsOverlap } from "../os_account";
import type { RunAsPolicy } from "../system_user";
import { assertAccountSid, encodePowerShell, grantFolder, lookupWindowsAccount, revokeFolder, setWindowsRunner } from "../windows_acl";

const policy = (p: Partial<RunAsPolicy> = {}): RunAsPolicy => ({ defaultUser: "", allowedUsers: [], allowRoot: false, ...p });

describe("account names", () => {
  it("accepts POSIX names and refuses ids, options and shell syntax", () => {
    for (const ok of ["alice", "mc_server", "_svc", "a-b", "A1"]) expect(isValidOsAccountName(ok, "linux")).toBe(true);
    for (const bad of ["1000", "0", "-u", "--help", "a b", "a;id", "$(id)", "a/b", "../x", "", "x".repeat(33), "alice\n", "DOMAIN\\alice"]) {
      expect(isValidOsAccountName(bad, "linux")).toBe(false);
    }
  });

  it("accepts Windows names with an optional domain and refuses the rest", () => {
    for (const ok of ["alice", "John Smith", "DESKTOP-1\\alice", "CORP\\svc.mc", "a_b-c"]) expect(isValidOsAccountName(ok, "win32")).toBe(true);
    for (const bad of ["1000", " alice", "alice ", "alice.", "-alice", "a\"b", "a|b", "a&b", "a%PATH%b", "x".repeat(21), "\\\\server\\x", "a\\b\\c"]) {
      expect(isValidOsAccountName(bad, "win32")).toBe(false);
    }
  });
});

describe("binding limits", () => {
  const posix = (uid: number) => ({ kind: "posix" as const, uid, gid: uid });

  it("never links to root, even when runAs may use root", () => {
    expect(() => assertBindingAllowed("root", posix(0), policy({ allowRoot: true }), 0)).toThrow(/root/);
  });

  it("applies allowedUsers (case-insensitively on Windows)", () => {
    expect(() => assertBindingAllowed("bob", posix(1002), policy({ allowedUsers: ["alice"] }), 0)).toThrow(/allowedUsers/);
    expect(() => assertBindingAllowed("alice", posix(1001), policy({ allowedUsers: ["alice"] }), 0)).not.toThrow();
    const win = { kind: "windows" as const, sid: "S-1-5-21-1-2-3-1001" };
    expect(() => assertBindingAllowed("ALICE", win, policy({ allowedUsers: ["alice"] }), undefined)).not.toThrow();
  });

  it("needs a root daemon unless the account is the daemon's own", () => {
    expect(() => assertBindingAllowed("alice", posix(1001), policy(), 1000)).toThrow(/needs the daemon to run as root/);
    expect(() => assertBindingAllowed("me", posix(1000), policy(), 1000)).not.toThrow();
  });
});

describe("folders", () => {
  const temps: string[] = [];
  afterEach(() => {
    while (temps.length) fs.rmSync(temps.pop()!, { recursive: true, force: true });
  });

  it("tells strictly-below and overlapping paths apart", () => {
    expect(isStrictlyBelow("/srv/data", "/srv/data/a")).toBe(true);
    expect(isStrictlyBelow("/srv/data", "/srv/data")).toBe(false);
    expect(isStrictlyBelow("/srv/data", "/srv/data2")).toBe(false);
    expect(isStrictlyBelow("/srv/data", "/srv")).toBe(false);
    expect(pathsOverlap("/srv/a", "/srv/a/b")).toBe(true);
    expect(pathsOverlap("/srv/a/b", "/srv/a")).toBe(true);
    expect(pathsOverlap("/srv/a", "/srv/ab")).toBe(false);
  });

  it.skipIf(process.platform === "win32")("names the first parent folder the account cannot pass", () => {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "osacct-")));
    temps.push(base);
    const locked = path.join(base, "locked");
    const ws = path.join(locked, "ws");
    fs.mkdirSync(ws, { recursive: true });
    fs.chmodSync(base, 0o755);
    fs.chmodSync(locked, 0o750);
    expect(blockingAncestor(ws, 65534, 65534)).toBe(locked);
    fs.chmodSync(locked, 0o751);
    expect(blockingAncestor(ws, 65534, 65534)).toBeUndefined();
  });
});

describe("Windows accounts (mocked runner)", () => {
  afterEach(() => setWindowsRunner());

  it("accepts only ordinary account SIDs", () => {
    expect(assertAccountSid("alice", "S-1-5-21-111-222-333-1001", false)).toBe("S-1-5-21-111-222-333-1001");
    expect(() => assertAccountSid("Everyone", "S-1-1-0", false)).toThrow(/not an ordinary/);
    expect(() => assertAccountSid("SYSTEM", "S-1-5-18", false)).toThrow(/not an ordinary/);
    expect(() => assertAccountSid("Users", "S-1-5-32-545", false)).toThrow(/not an ordinary/);
    expect(() => assertAccountSid("Administrator", "S-1-5-21-111-222-333-500", false)).toThrow(/built-in/);
    expect(() => assertAccountSid("Staff", "S-1-5-21-111-222-333-1005", true)).toThrow(/group/);
  });

  it("passes the name in the environment, never on the command line", async () => {
    const calls: Array<{ file: string; args: string[]; env?: NodeJS.ProcessEnv }> = [];
    setWindowsRunner(async (file, args, env) => {
      calls.push({ file, args, env });
      return { stdout: JSON.stringify({ sid: "S-1-5-21-1-2-3-1001", group: false }), stderr: "" };
    });
    await expect(lookupWindowsAccount("John Smith")).resolves.toBe("S-1-5-21-1-2-3-1001");
    expect(calls[0].file).toBe("powershell.exe");
    expect(calls[0].args.join(" ")).not.toContain("John");
    expect(calls[0].env?.MCSM_OS_ACCOUNT).toBe("John Smith");
    const script = Buffer.from(calls[0].args.at(-1)!, "base64").toString("utf16le");
    expect(script).toContain("$env:MCSM_OS_ACCOUNT");
    expect(encodePowerShell("x")).toBe(Buffer.from("x", "utf16le").toString("base64"));
  });

  it("refuses invalid names before running anything, and groups after the lookup", async () => {
    let ran = 0;
    setWindowsRunner(async () => {
      ran++;
      return { stdout: JSON.stringify({ sid: "S-1-5-21-1-2-3-1001", group: true }), stderr: "" };
    });
    await expect(lookupWindowsAccount("a&b")).rejects.toThrow(/not a valid/);
    expect(ran).toBe(0);
    await expect(lookupWindowsAccount("Staff")).rejects.toThrow(/group/);
  });

  it("grants and removes access by SID with icacls", async () => {
    const calls: string[][] = [];
    setWindowsRunner(async (file, args) => {
      calls.push([file, ...args]);
      return { stdout: "", stderr: "" };
    });
    await grantFolder("C:\\MCSM\\InstanceData\\abc", "S-1-5-21-1-2-3-1001", "F");
    await revokeFolder("C:\\MCSM\\InstanceData\\abc", "S-1-5-21-1-2-3-1001");
    expect(calls[0]).toEqual(["icacls", "C:\\MCSM\\InstanceData\\abc", "/grant:r", "*S-1-5-21-1-2-3-1001:(OI)(CI)F", "/Q"]);
    expect(calls[1]).toEqual(["icacls", "C:\\MCSM\\InstanceData\\abc", "/remove:g", "*S-1-5-21-1-2-3-1001", "/Q"]);
    await expect(grantFolder("C:\\x", "S-1-1-0", "F")).rejects.toThrow();
  });
});
