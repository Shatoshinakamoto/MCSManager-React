/**
 * Tests for the build integrity check (Johnnykins TamperProofPlugin port),
 * including the self-updater keeping hashes in step.
 */
import fs from "fs-extra";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { checkIntegrity, refreshIntegrityHashes, verifyIntegrityOrExit } from "../tamper_check";
import { applyUpgradePackage } from "../upgrade";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TamperProofPlugin } = require("../../tamper_proof_plugin.js");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "mcsm-tamper-"));
const quiet = { info: () => {}, warn: () => {}, error: () => {} };
const throwExit = (code: number): never => {
  throw new Error(`exit ${code}`);
};

function build(dir: string, app = "console.log(1)", map = "{}") {
  fs.writeFileSync(path.join(dir, "app.js"), app);
  fs.writeFileSync(path.join(dir, "app.js.map"), map);
  // Run the real webpack plugin hook against this folder.
  let hook: () => void = () => {};
  new TamperProofPlugin().apply({ outputPath: dir, hooks: { afterEmit: { tap: (_: string, fn: () => void) => (hook = fn) } } });
  hook();
}

describe("tamper check", () => {
  it("accepts an untouched build", () => {
    const dir = tmp();
    build(dir);
    expect(checkIntegrity(dir)).toEqual({ status: "ok" });
  });

  it("detects an edited app.js and an edited source map", () => {
    const dir = tmp();
    build(dir);
    fs.appendFileSync(path.join(dir, "app.js"), "\nrequire('child_process')");
    expect(checkIntegrity(dir)).toEqual({ status: "mismatch", file: "app.js" });
    build(dir);
    fs.writeFileSync(path.join(dir, "app.js.map"), "{\"x\":1}");
    expect(checkIntegrity(dir)).toEqual({ status: "mismatch", file: "app.js.map" });
  });

  it("treats a malformed hash file as a mismatch", () => {
    const dir = tmp();
    build(dir);
    fs.writeFileSync(path.join(dir, "app-hash.txt"), "not-a-hash");
    expect(checkIntegrity(dir).status).toBe("mismatch");
  });

  it("refuses to start on mismatch or missing hashes, unless --dev is allowed", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "app.js"), "x");
    expect(() => verifyIntegrityOrExit({ name: "panel", logger: quiet, devAllowed: true, dir, exit: throwExit })).toThrow("exit 1");
    process.argv.push("--dev");
    try {
      expect(verifyIntegrityOrExit({ name: "panel", logger: quiet, devAllowed: true, dir, exit: throwExit }).status).toBe("missing");
      expect(() => verifyIntegrityOrExit({ name: "panel", logger: quiet, devAllowed: false, dir, exit: throwExit })).toThrow("exit 1");
    } finally {
      process.argv.pop();
    }
  });

  it("refreshes hashes after an applied update package", async () => {
    const install = tmp();
    build(install, "old");
    const pkg = tmp();
    fs.writeFileSync(path.join(pkg, "app.js"), "new build");
    const result = await applyUpgradePackage({ extractDir: pkg, cwd: install, backupBase: path.join(tmp(), "bak") });
    expect(result.overlays).toContain("app.js");
    expect(checkIntegrity(install)).toEqual({ status: "ok" });
  });

  it("does not create hashes for installs that never had them", async () => {
    const install = tmp();
    fs.writeFileSync(path.join(install, "app.js"), "old");
    const pkg = tmp();
    fs.writeFileSync(path.join(pkg, "app.js"), "new");
    await applyUpgradePackage({ extractDir: pkg, cwd: install, backupBase: path.join(tmp(), "bak") });
    expect(fs.existsSync(path.join(install, "app-hash.txt"))).toBe(false);
    expect(refreshIntegrityHashes(tmp())).toEqual([]);
  });
});
