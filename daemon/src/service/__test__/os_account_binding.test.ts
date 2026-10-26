/**
 * Tests for OS account bindings (service/os_account_binding.ts) on a real
 * instance subsystem in a throw-away data folder, with real host accounts:
 * one identity per instance, never root, stopped-instance rule, blocking
 * parent folders, overlapping workspaces, the hand-over itself, fail-closed
 * file writes, the after-install hand-over, the router, clearing, and
 * per-account Java runtimes (root-only staging, hand-over, scoped selection,
 * removal as the account).
 *
 * Needs root on Linux and the standard `nobody` and `daemon` accounts; skips
 * otherwise. Openspec: link-panel-users-to-os-accounts.
 */
import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../log", () => {
  const f: any = () => {};
  f.info = f;
  f.debug = f;
  f.warn = f;
  f.error = f;
  return { default: f };
});
vi.mock("../disk_limit_service", () => ({
  default: { checkDiskNow: async () => ({ isFull: false }), checkInstanceDiskSize: () => {} },
  convertBytesToGB: (v: number) => v,
  convertGBToBytes: (v: number) => v
}));
vi.mock("../upload_manager", () => ({ default: { getUploads: () => new Map(), getByPath: () => undefined } }));

function hasAccount(name: string) {
  try {
    return fs.readFileSync("/etc/passwd", "utf8").split("\n").some((l) => l.startsWith(`${name}:`));
  } catch {
    return false;
  }
}

const runnable = process.platform === "linux" && process.getuid?.() === 0 && hasAccount("nobody") && hasAccount("daemon");
const originalCwd = process.cwd();
let tmpDir = "";
let Instance: any;
let InstanceSubsystem: any;
let binding: typeof import("../os_account_binding");
let ownership: typeof import("../../tools/file_ownership");

describe.skipIf(!runnable)("OS account bindings (root)", () => {
  beforeAll(async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mcsm-osacct-")));
    fs.chmodSync(tmpDir, 0o755);
    process.chdir(tmpDir);
    Instance = (await import("../../entity/instance/instance")).default;
    InstanceSubsystem = (await import("../system_instance")).default;
    binding = await import("../os_account_binding");
    ownership = await import("../../tools/file_ownership");
    fs.chmodSync(path.join(tmpDir, "data"), 0o755);
    fs.chmodSync(InstanceSubsystem.getInstanceDataDir(), 0o755);
  }, 60000);

  afterAll(() => {
    process.chdir(originalCwd);
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const newInstance = (cfg: any = {}) =>
    InstanceSubsystem.createInstance({ nickname: "t", startCommand: "cat", stopCommand: "^C", processType: "general", type: "universal", ...cfg });

  it("refuses numeric ids, root and mixed identities before changing anything", async () => {
    const inst = newInstance();
    await expect(binding.planBinding(inst, ["1000"])).rejects.toThrow(/not a valid/);
    await expect(binding.planBinding(inst, ["root"])).rejects.toThrow(/root/);
    await expect(binding.planBinding(inst, ["nobody", "daemon"])).rejects.toThrow(/different OS identities/);
    await expect(binding.planBinding(inst, "nobody")).rejects.toThrow(/list/);
    expect(inst.config.osAccount).toBe("");
  });

  it("hands the workspace over and stores the binding", async () => {
    const inst = newInstance();
    const ws = inst.absoluteCwdPath();
    fs.writeFileSync(path.join(ws, "start.sh"), "#!/bin/sh\n", { mode: 0o644 });
    fs.mkdirSync(path.join(ws, "world"));
    const r = await binding.applyBinding(inst, ["nobody"]);
    expect(r.tree?.failed).toBe(0);
    expect(inst.config.osAccount).toBe("nobody");
    for (const p of ["", "start.sh", "world"]) expect(fs.lstatSync(path.join(ws, p)).uid).toBe(65534);
    expect(fs.lstatSync(path.join(ws, "start.sh")).mode & 0o100).toBe(0o100);
    const stored = fs.readJsonSync(path.join(tmpDir, "data", "InstanceConfig", `${inst.instanceUuid}.json`));
    expect(stored.osAccount).toBe("nobody");
    expect(inst.runAsLabel()).toBe("nobody");
    expect(inst.generateEnv().USER).toBe("nobody");
    expect(await inst.parseTextParams("{mcsm_run_as}")).toBe("nobody");
  });

  it("asks for a stop before changing a running instance's identity", async () => {
    const inst = newInstance();
    inst.status(Instance.STATUS_RUNNING);
    try {
      await expect(binding.planBinding(inst, ["daemon"])).rejects.toThrow(/Stop instance/);
    } finally {
      inst.status(Instance.STATUS_STOP);
    }
  });

  it("names a parent folder the account cannot pass and leaves it alone", async () => {
    const inst = newInstance();
    const dataDir = InstanceSubsystem.getInstanceDataDir();
    fs.chmodSync(dataDir, 0o700);
    try {
      await expect(binding.planBinding(inst, ["nobody"])).rejects.toThrow(/cannot pass the folder/);
      expect(fs.statSync(dataDir).mode & 0o777).toBe(0o700);
    } finally {
      fs.chmodSync(dataDir, 0o755);
    }
  });

  it("refuses overlapping workspaces of different accounts and workspaces outside the hand-over folders", async () => {
    const outer = newInstance();
    const inner = newInstance({ cwd: path.join(outer.absoluteCwdPath(), "nested") });
    await expect(binding.planBinding(outer, ["nobody"])).rejects.toThrow(/overlaps/);
    InstanceSubsystem.instances.delete(inner.instanceUuid);

    const elsewhere = fs.mkdtempSync(path.join(tmpDir, "elsewhere-"));
    fs.chmodSync(elsewhere, 0o755);
    const outside = newInstance({ cwd: elsewhere });
    await expect(binding.planBinding(outside, ["nobody"])).rejects.toThrow(/outside the instance data folder/);
    fs.chownSync(elsewhere, 65534, 65534);
    const plan = await binding.planBinding(outside, ["nobody"]);
    expect(plan.walk).toBe(false);
  });

  it("keeps file manager writes with the bound account and fails closed when it is gone", async () => {
    const inst = newInstance();
    await binding.applyBinding(inst, ["nobody"]);
    const ws = inst.absoluteCwdPath();
    await ownership.writeAsInstanceOwner(inst, path.join(ws, "a", "b", "c"), () => fs.mkdirSync(path.join(ws, "a", "b", "c"), { recursive: true }));
    for (const p of ["a", "a/b", "a/b/c"]) expect(fs.lstatSync(path.join(ws, p)).uid).toBe(65534);

    inst.config.osAccount = "no_such_account_x";
    let wrote = false;
    await expect(
      ownership.writeAsInstanceOwner(inst, path.join(ws, "x.txt"), () => {
        wrote = true;
      })
    ).rejects.toThrow(/cannot be used/);
    expect(wrote).toBe(false);
    inst.config.osAccount = "nobody";
  });

  it("hands files written by an install task to the account", async () => {
    const inst = newInstance();
    await binding.applyBinding(inst, ["nobody"]);
    const file = path.join(inst.absoluteCwdPath(), "server.jar");
    fs.writeFileSync(file, "jar");
    expect(fs.lstatSync(file).uid).toBe(0);
    await binding.handBackAfterTask(inst, "install");
    expect(fs.lstatSync(file).uid).toBe(65534);
  });

  it("keeps per-account Java runtimes with their account", async () => {
    const javaManager = (await import("../java_manager")).default;
    const { JavaInfo } = await import("../../entity/commands/java/java_manager");
    const { handOverTree } = await import("../../tools/owner_tree");
    const inst = newInstance();
    await binding.applyBinding(inst, ["nobody"]);
    const { identity, scope } = await javaManager.scopeOf(inst);
    expect(scope).toBe("65534-65534");

    const entry = await javaManager.beginScopedDownload(new JavaInfo("zulu", Date.now(), "21"), scope!);
    expect(entry.id).toBe("zulu_21@65534-65534");
    const staged = await javaManager.newStagingFolder();
    expect(fs.statSync(path.dirname(staged)).mode & 0o777).toBe(0o700);
    fs.mkdirSync(path.join(staged, "bin"));
    fs.writeFileSync(path.join(staged, "bin", "java"), "#!/bin/sh\necho java\n", { mode: 0o755 });
    const tree = await handOverTree(staged, identity as any, { mode: "handOver", closeTop: true });
    expect(tree.failed).toBe(0);
    await javaManager.finishScopedDownload(entry, staged);

    const scopeDir = path.join(javaManager.accountsDir(), scope!);
    for (const dir of [javaManager.accountsDir(), scopeDir]) {
      const st = fs.lstatSync(dir);
      expect([st.uid, st.mode & 0o777]).toEqual([0, 0o711]);
    }
    const record = fs.lstatSync(path.join(scopeDir, "zulu_21.json"));
    expect([record.uid, record.mode & 0o777]).toEqual([0, 0o600]);
    const bin = fs.lstatSync(path.join(entry.path, "bin", "java"));
    expect(bin.uid).toBe(65534);
    expect(bin.mode & 0o100).toBe(0o100);

    // Only instances of the same identity see and select it.
    expect(javaManager.list(scope).some((j) => j.id === entry.id)).toBe(true);
    expect(javaManager.list(null).some((j) => j.id === entry.id)).toBe(false);
    expect(javaManager.resolveForScope("zulu_21", scope).id).toBe(entry.id);
    expect(() => javaManager.resolveForScope(entry.id, "1-1")).toThrow(/another OS account/);
    expect(await javaManager.getJavaRuntimeCommand(entry.id, inst)).toBe(`"${path.join(entry.path, "bin", "java")}"`);

    // Removal runs as the account, then the daemon removes the empty folder.
    await javaManager.removeJava(entry.id);
    expect(fs.existsSync(entry.path)).toBe(false);
    expect(fs.existsSync(path.join(scopeDir, "zulu_21.json"))).toBe(false);
    expect(javaManager.getJava(entry.id)).toBeUndefined();
  });

  it("serves the routes and clears a binding without touching file owners", async () => {
    const { invoke } = await import("../../../test/harness/router");
    await import("../../routers/os_account_router");
    const inst = newInstance();
    const { socket } = invoke("instance/os_account/check", { instanceUuid: inst.instanceUuid, accounts: ["daemon"] });
    for (let i = 0; i < 100 && !socket.emit.mock.calls.length; i++) await new Promise((r) => setTimeout(r, 50));
    expect(socket.emit).toHaveBeenCalled();
    const packet = socket.emit.mock.calls[0][1];
    expect(packet.status).toBe(200);
    expect(packet.data.bound).toBe("daemon");
    expect(inst.config.osAccount).toBe("");

    await binding.applyBinding(inst, ["daemon"]);
    expect(fs.lstatSync(inst.absoluteCwdPath()).uid).toBe(1);
    await binding.applyBinding(inst, []);
    expect(inst.config.osAccount).toBe("");
    expect(fs.lstatSync(inst.absoluteCwdPath()).uid).toBe(1);
  });
});
