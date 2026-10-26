/**
 * Tests for tools/owner_tree.ts, the walk that hands a workspace or a Java
 * runtime to an OS account: modes (execute bits kept, programs made
 * runnable, setuid dropped), links never followed (CWE-59), hard links left
 * alone (CWE-62), a symbolic link in the middle of a path refused (CWE-367),
 * and the owner-only variant used for file manager writes.
 *
 * Owner changes need root; those cases skip on non-root or non-Linux runs.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { fdPathsSupported, handOverMode, handOverTree, ownBeneath, startsLikeProgram } from "../owner_tree";

const asRoot = process.platform === "linux" && process.getuid?.() === 0 && fdPathsSupported();
const NOBODY = { uid: 65534, gid: 65534 };
const temps: string[] = [];

function tempDir(prefix = "owner-tree-") {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
}

afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop()!, { recursive: true, force: true });
});

describe("hand-over modes", () => {
  it("gives the owner read/write, keeps and adds execute where it belongs, drops setuid", () => {
    expect(handOverMode(0o644, false, false)).toBe(0o644);
    expect(handOverMode(0o444, false, false)).toBe(0o644);
    expect(handOverMode(0o644, false, true)).toBe(0o744);
    expect(handOverMode(0o055, false, false)).toBe(0o755);
    expect(handOverMode(0o4755, false, false)).toBe(0o755);
    expect(handOverMode(0o2750, true, false)).toBe(0o750);
    expect(handOverMode(0o055, true, false)).toBe(0o755);
  });

  it("recognises scripts, ELF and Mach-O files", () => {
    expect(startsLikeProgram(Buffer.from("#!/bin/sh\n"))).toBe(true);
    expect(startsLikeProgram(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))).toBe(true);
    expect(startsLikeProgram(Buffer.from([0xcf, 0xfa, 0xed, 0xfe]))).toBe(true);
    expect(startsLikeProgram(Buffer.from("motd=hi"))).toBe(false);
    expect(startsLikeProgram(Buffer.from("#"))).toBe(false);
  });
});

describe.skipIf(!asRoot)("hand-over walk (root)", () => {
  it("hands every plain file and folder over and keeps programs runnable", async () => {
    const ws = tempDir();
    fs.chmodSync(ws, 0o755);
    fs.writeFileSync(path.join(ws, "start.sh"), "#!/bin/sh\necho hi\n", { mode: 0o644 });
    fs.writeFileSync(path.join(ws, "server.bin"), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0]), { mode: 0o755 });
    fs.writeFileSync(path.join(ws, "readonly.txt"), "x", { mode: 0o444 });
    fs.writeFileSync(path.join(ws, "suid"), "x", { mode: 0o644 });
    fs.chmodSync(path.join(ws, "suid"), 0o4755);
    fs.mkdirSync(path.join(ws, "world", "region"), { recursive: true });
    fs.writeFileSync(path.join(ws, "world", "region", "r.0.0.mca"), "data", { mode: 0o600 });

    const r = await handOverTree(ws, NOBODY, { mode: "handOver", closeTop: true });
    expect(r.failed).toBe(0);
    for (const p of ["", "start.sh", "server.bin", "readonly.txt", "suid", "world", "world/region", "world/region/r.0.0.mca"]) {
      const st = fs.lstatSync(path.join(ws, p));
      expect([p, st.uid, st.gid]).toEqual([p, NOBODY.uid, NOBODY.gid]);
    }
    const mode = (p: string) => fs.lstatSync(path.join(ws, p)).mode & 0o7777;
    expect(mode("start.sh")).toBe(0o744);
    expect(mode("server.bin")).toBe(0o755);
    expect(mode("readonly.txt")).toBe(0o644);
    expect(mode("suid")).toBe(0o755);
    expect(mode("")).toBe(0o750);

    // Idempotent: a second run changes nothing.
    const again = await handOverTree(ws, NOBODY, { mode: "handOver", closeTop: true });
    expect(again.changed).toBe(0);
    expect(again.failed).toBe(0);
  });

  it("never follows links out of the tree and leaves hard-linked files alone", async () => {
    const ws = tempDir();
    const outside = tempDir("owner-outside-");
    const secret = path.join(outside, "secret");
    fs.writeFileSync(secret, "s", { mode: 0o600 });
    fs.mkdirSync(path.join(outside, "dir"));
    fs.symlinkSync(outside, path.join(ws, "link-to-dir"));
    fs.symlinkSync(secret, path.join(ws, "link-to-file"));
    fs.linkSync(secret, path.join(ws, "hard"));

    const r = await handOverTree(ws, NOBODY, { mode: "handOver" });
    expect(r.failed).toBe(0);
    expect(r.skipped).toBeGreaterThanOrEqual(3);
    expect(r.samples.join(" ")).toContain("hard link");
    expect(fs.lstatSync(secret).uid).toBe(0);
    expect(fs.lstatSync(path.join(outside, "dir")).uid).toBe(0);
    expect(fs.lstatSync(path.join(ws, "link-to-dir")).uid).toBe(0);
  });

  it("refuses a top folder that is a symbolic link", async () => {
    const outside = tempDir("owner-outside-");
    const base = tempDir();
    fs.symlinkSync(outside, path.join(base, "ws"));
    await expect(handOverTree(path.join(base, "ws"), NOBODY, { mode: "handOver" })).rejects.toThrow();
    expect(fs.lstatSync(outside).uid).toBe(0);
  });

  it("owner-only sync refuses a symbolic link in the middle of the path", async () => {
    const ws = tempDir();
    const outside = tempDir("owner-outside-");
    fs.writeFileSync(path.join(outside, "victim"), "v");
    fs.symlinkSync(outside, path.join(ws, "sub"));
    await expect(ownBeneath(ws, path.join(ws, "sub", "victim"), NOBODY, false)).rejects.toThrow(/not a folder/);
    expect(fs.lstatSync(path.join(outside, "victim")).uid).toBe(0);
  });

  it("owner-only sync hands a new folder tree over and keeps modes", async () => {
    const ws = tempDir();
    fs.mkdirSync(path.join(ws, "copy", "a"), { recursive: true });
    fs.writeFileSync(path.join(ws, "copy", "a", "run.sh"), "#!/bin/sh\n", { mode: 0o750 });
    fs.writeFileSync(path.join(ws, "other.txt"), "keep root");
    const r = await ownBeneath(ws, path.join(ws, "copy"), NOBODY, true);
    expect(r.failed).toBe(0);
    expect(fs.lstatSync(path.join(ws, "copy", "a", "run.sh")).uid).toBe(NOBODY.uid);
    expect(fs.lstatSync(path.join(ws, "copy", "a", "run.sh")).mode & 0o777).toBe(0o750);
    expect(fs.lstatSync(path.join(ws, "other.txt")).uid).toBe(0);
    expect(fs.lstatSync(ws).uid).toBe(0);
  });

  it("owner-only sync ignores missing targets and rejects paths outside the root", async () => {
    const ws = tempDir();
    const r = await ownBeneath(ws, path.join(ws, "missing"), NOBODY, false);
    expect(r.changed + r.failed).toBe(0);
    await expect(ownBeneath(ws, path.join(ws, "..", "x"), NOBODY, false)).rejects.toThrow(/outside/);
  });
});
