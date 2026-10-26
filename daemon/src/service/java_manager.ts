/**
 * Java runtimes for instances (the Java Manager): shared runtimes in
 * JavaData/<name_version> (upstream), plus per-account runtimes for
 * instances linked to an OS account, in JavaData/accounts/<scope>/<runtime>
 * where the scope is "<uid>-<gid>" (POSIX) or the account's SID (Windows).
 * Routes: routers/java_manager_router.ts. Docs:
 * docs/features/os-user-accounts.md (per-account runtimes).
 *
 * Per-account runtimes (decision 5 of
 * openspec/changes/link-panel-users-to-os-accounts/design.md):
 * - downloaded and unpacked in JavaData/.staging (root only), handed to the
 *   account with the no-follow walk, then renamed into place, so the
 *   account can never steer the unpacking;
 * - JavaData/accounts and each scope folder are root-owned 0711, and each
 *   runtime's record (<runtime>.json) is root-owned 0600 next to it, so the
 *   account owns its runtime but not the daemon's records;
 * - removed by a process running as the account (rm with its uid/gid), then
 *   the empty folder by root: root never walks an account-owned tree;
 * - listed and selected only by instances bound to the same identity.
 *
 * SECURITY: runtime names are limited to [A-Za-z0-9._-] (CWE-22); another
 * account's runtime can never be selected or started (CWE-732, CWE-269).
 */
import axios from "axios";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs-extra";
import os from "os";
import path from "path";
import StorageSubsystem from "../common/system_storage";
import { JavaInfo } from "../entity/commands/java/java_manager";
import { globalConfiguration } from "../entity/config";
import type Instance from "../entity/instance/instance";
import { $t } from "../i18n";
import { blockingAncestor, blockingHint, boundIdentity, identityKey, type OsIdentity } from "../tools/os_account";
import logger from "./log";
import InstanceSubsystem from "./system_instance";

export interface JavaRuntimeEntry extends IJavaRuntime {
  info: JavaInfo;
  id: string;
  scope?: string;
}

/** Runtime names that are safe as one folder name. */
export const JAVA_FULLNAME_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,64}$/;
const SCOPE_PATTERN = /^(?:\d{1,10}-\d{1,10}|S-1-5-21-\d{1,10}-\d{1,10}-\d{1,10}-\d{1,10})$/;

export function scopedId(fullname: string, scope?: string) {
  return scope ? `${fullname}@${scope}` : fullname;
}

class JavaManager {
  private javaDataDir = "";
  public readonly javaList = new Map<string, JavaRuntimeEntry>();

  constructor() {
    let javaDataDir = path.join(process.cwd(), "data/JavaData");
    if (globalConfiguration.config.defaultJavaDataPath) {
      javaDataDir = path.normalize(globalConfiguration.config.defaultJavaDataPath);
    }
    if (!fs.existsSync(javaDataDir)) fs.mkdirsSync(javaDataDir);
    this.javaDataDir = path.normalize(javaDataDir);

    this.loadJavaList();
  }

  public getJavaDataDir() {
    return this.javaDataDir;
  }

  public accountsDir() {
    return path.join(this.javaDataDir, "accounts");
  }

  public stagingDir() {
    return path.join(this.javaDataDir, ".staging");
  }

  async loadJavaList() {
    for (const file of await fs.readdir(this.javaDataDir)) {
      const javaPath = path.join(this.javaDataDir, file);
      const dir = await fs.stat(javaPath);
      if (!dir.isDirectory()) continue;

      const infoPath = path.join(javaPath, "java_info.json");
      if (!fs.existsSync(infoPath)) continue;

      const config = await fs.readJson(infoPath);
      // Delete java not yet fully downloaded
      if (config.downloading) {
        await fs.remove(javaPath);
        continue;
      }

      const info = new JavaInfo(config.name, config.installTime ?? Date.now(), config.version);
      info.path = config.path;
      this.javaList.set(info.fullname, {
        id: info.fullname,
        info: info,
        path: javaPath,
        usingInstances: []
      });
    }
    await this.loadScopedJavaList().catch((err) => logger.warn(`[Java] Could not read per-account runtimes: ${err?.message ?? err}`));
  }

  /** Reads JavaData/accounts/<scope>/<runtime>.json records; cleans up interrupted downloads. */
  private async loadScopedJavaList() {
    // Staging is root-only (0700), so clearing it as root is safe.
    await fs.remove(this.stagingDir());
    const accounts = this.accountsDir();
    if (!fs.existsSync(accounts)) return;
    for (const scope of await fs.readdir(accounts)) {
      if (!SCOPE_PATTERN.test(scope)) continue;
      const scopeDir = path.join(accounts, scope);
      if (!(await fs.lstat(scopeDir)).isDirectory()) continue;
      for (const file of await fs.readdir(scopeDir)) {
        if (!file.endsWith(".json")) continue;
        const fullname = file.slice(0, -5);
        if (!JAVA_FULLNAME_PATTERN.test(fullname)) continue;
        const recordPath = path.join(scopeDir, file);
        const record = await fs.readJson(recordPath).catch(() => undefined);
        const runtimePath = path.join(scopeDir, fullname);
        if (!record || record.downloading) {
          await this.removeRuntimeFolder(runtimePath, scope).catch(() => undefined);
          await fs.remove(recordPath);
          continue;
        }
        const info = new JavaInfo(record.name, record.installTime ?? Date.now(), record.version);
        const id = scopedId(info.fullname, scope);
        this.javaList.set(id, { id, scope, info, path: runtimePath, usingInstances: [] });
      }
    }
  }

  /** Every runtime (no instance context), or the shared ones plus `scope`'s. */
  list(scope?: string | null) {
    const all = Array.from(this.javaList.values());
    if (scope === undefined) return all;
    return all.filter((j) => !j.scope || j.scope === scope);
  }

  getJava(id: string) {
    return this.javaList.get(id);
  }

  exists(id: string) {
    return this.javaList.has(id);
  }

  /** The bound identity of `instance` (throws when it cannot be honoured) and its scope. */
  async scopeOf(instance?: Instance): Promise<{ identity?: OsIdentity; scope: string | null }> {
    if (!instance) return { scope: null };
    const identity = await boundIdentity(instance);
    return { identity, scope: identity ? identityKey(identity) : null };
  }

  /**
   * Finds runtime `id` for an instance whose scope is `scope` (null =
   * unbound). Plain ids prefer the shared runtime, then the instance's own;
   * "<name>@<scope>" ids must belong to the instance's scope.
   */
  resolveForScope(id: string, scope: string | null): JavaRuntimeEntry {
    const at = id.lastIndexOf("@");
    if (at > 0) {
      const java = this.javaList.get(id);
      if (!java) throw new Error($t("TXT_CODE_77ce8542"));
      if (java.scope !== scope) throw new Error("This Java runtime belongs to another OS account and cannot be used by this instance.");
      return java;
    }
    const shared = this.javaList.get(id);
    if (shared && !shared.scope) return shared;
    const own = scope ? this.javaList.get(scopedId(id, scope)) : undefined;
    if (own) return own;
    throw new Error($t("TXT_CODE_77ce8542"));
  }

  async getJavaDownloadUrl(info: JavaInfo) {
    switch (info.name) {
      case "zulu": {
        let platform: string = os.platform();

        // In some cases, using win32 will download macosx package
        // Therefore, change platform to windows
        switch (platform) {
          case "win32": {
            platform = "windows";
            break;
          }
        }

        const url =
          "https://api.azul.com/metadata/v1/zulu/packages/?java_package_type=jdk&javafx_bundled=true&release_status=ga&availability_types=CA&certifications=tck&page=1&page_size=2" +
          `&java_version=${info.version}&os=${platform}&arch=${os.arch()}`;
        const response = await axios.get(url, {
          timeout: 1000 * 3
        });

        const data = response.data;
        if (!data) return;

        const javaPackage = data.find(
          (p: any) => p.name.endsWith(".zip") || p.name.endsWith(".tar.gz")
        );
        if (!javaPackage) return;

        const downloadUrl = javaPackage.download_url;
        if (!downloadUrl) return;

        return downloadUrl;
      }
    }
  }

  addJava(info: JavaInfo) {
    const javaPath = path.join(this.javaDataDir, info.fullname);
    if (!fs.existsSync(javaPath)) fs.mkdirsSync(javaPath);

    StorageSubsystem.store(`JavaData/${info.fullname}`, "java_info", {
      name: info.name,
      path: info.path,
      version: info.version,
      installTime: info.installTime,
      downloading: false
    });

    this.javaList.set(info.fullname, {
      id: info.fullname,
      info: info,
      path: javaPath,
      usingInstances: []
    });
  }

  updateJavaInfo(info: JavaInfo) {
    const javaPath = path.join(this.javaDataDir, info.fullname);
    if (!fs.existsSync(javaPath)) return;

    StorageSubsystem.store(`JavaData/${info.fullname}`, "java_info", {
      name: info.name,
      path: info.path,
      version: info.version,
      installTime: info.installTime,
      downloading: false
    });
  }

  /** Makes `dir` a root-owned 0711 folder (not a link), creating it when missing. */
  private async ensurePrivateFolder(dir: string) {
    await fs.mkdir(dir, { mode: 0o711 }).catch((err: any) => {
      if (err?.code !== "EEXIST") throw err;
    });
    const st = await fs.lstat(dir);
    if (!st.isDirectory()) throw new Error(`${dir} is not a folder`);
    if (process.platform !== "win32") {
      const me = typeof process.getuid === "function" ? process.getuid() : 0;
      if (st.uid !== me) throw new Error(`${dir} must belong to the daemon's account`);
      if ((st.mode & 0o7777) !== 0o711) await fs.chmod(dir, 0o711);
    }
  }

  /** A root-only folder to download and unpack into. */
  async newStagingFolder(): Promise<string> {
    const staging = this.stagingDir();
    await fs.mkdir(staging, { mode: 0o700 }).catch((err: any) => {
      if (err?.code !== "EEXIST") throw err;
    });
    if (process.platform !== "win32") await fs.chmod(staging, 0o700);
    const dir = path.join(staging, randomUUID());
    await fs.mkdir(dir, { mode: 0o700 });
    return dir;
  }

  /** Folder for `scope`'s runtimes (root-owned 0711). */
  async scopeFolder(scope: string): Promise<string> {
    if (!SCOPE_PATTERN.test(scope)) throw new Error(`Invalid runtime scope ${scope}`);
    await this.ensurePrivateFolder(this.accountsDir());
    const dir = path.join(this.accountsDir(), scope);
    await this.ensurePrivateFolder(dir);
    return dir;
  }

  private async writeScopedRecord(scope: string, info: JavaInfo, downloading: boolean) {
    const file = path.join(this.accountsDir(), scope, `${info.fullname}.json`);
    const body = JSON.stringify({ name: info.name, version: info.version, installTime: info.installTime, downloading });
    await fs.writeFile(file, body, { mode: 0o600 });
    if (process.platform !== "win32") await fs.chmod(file, 0o600);
  }

  /** Registers a per-account runtime that is being downloaded. */
  async beginScopedDownload(info: JavaInfo, scope: string): Promise<JavaRuntimeEntry> {
    const dir = await this.scopeFolder(scope);
    const id = scopedId(info.fullname, scope);
    const entry: JavaRuntimeEntry = { id, scope, info, path: path.join(dir, info.fullname), usingInstances: [] };
    this.javaList.set(id, entry);
    await this.writeScopedRecord(scope, info, true);
    return entry;
  }

  /** Moves an unpacked, handed-over staging folder into place and records it. */
  async finishScopedDownload(entry: JavaRuntimeEntry, staged: string) {
    if (!entry.scope) throw new Error("not a per-account runtime");
    if (fs.existsSync(entry.path)) throw new Error($t("TXT_CODE_79cf0302"));
    await fs.rename(staged, entry.path);
    entry.info.downloading = false;
    await this.writeScopedRecord(entry.scope, entry.info, false);
  }

  async getJavaRuntimeCommand(id: string, instance?: Instance) {
    const { identity, scope } = await this.scopeOf(instance);
    const java = instance ? this.resolveForScope(id, scope) : this.getJava(id);
    if (!java) throw new Error($t("TXT_CODE_77ce8542"));
    if (java.info.downloading) throw new Error($t("TXT_CODE_45d02bb7"));

    let javaPath = java.info.path ?? java.path;
    if (!javaPath) throw new Error($t("TXT_CODE_82c8bca3"));

    // For macOS, if Java is within a .jdk bundle, use the Contents/Home/bin/java path
    if (os.platform() === "darwin") {
      // Scan first-level subdirectories under javaPath to find Contents directory
      try {
        const entries = await fs.readdir(javaPath);
        for (const entry of entries) {
          const entryPath = path.join(javaPath, entry);
          const stat = await fs.stat(entryPath);
          if (stat.isDirectory()) {
            const contentsPath = path.join(entryPath, "Contents");
            if (await fs.pathExists(contentsPath)) {
              // Found Contents directory, construct new javaPath
              javaPath = path.join(entryPath, "Contents", "Home");
              break;
            }
          }
        }
      } catch (error) {
        // If scan fails, use original javaPath
      }
    }

    const javaRuntimePath = path.join(
      javaPath,
      "bin",
      os.platform() == "win32" ? "java.exe" : "java"
    );

    // A bound instance runs Java as its account: make sure that account can.
    if (identity?.kind === "posix" && instance) {
      let real = javaRuntimePath;
      try {
        real = fs.realpathSync(javaRuntimePath);
      } catch {
        // missing: the start itself reports it
      }
      const blocked = blockingAncestor(real, identity.uid, identity.gid);
      if (blocked) throw new Error(blockingHint(blocked, instance.config.osAccount));
      const st = fs.existsSync(real) ? fs.statSync(real) : undefined;
      const bits = st ? (st.uid === identity.uid ? (st.mode >> 6) & 7 : st.gid === identity.gid ? (st.mode >> 3) & 7 : st.mode & 7) : 7;
      if (identity.uid !== 0 && !(bits & 1)) throw new Error(`The OS account "${instance.config.osAccount}" cannot run ${real}. Download a runtime for this instance in the Java Manager.`);
    }

    return `"${javaRuntimePath}"`;
  }

  /**
   * Deletes a per-account runtime folder: its contents by a process running
   * as the owning account, then the (empty) folder itself by the daemon.
   */
  private async removeRuntimeFolder(dir: string, scope: string) {
    if (!fs.existsSync(dir)) return;
    const posix = /^(\d+)-(\d+)$/.exec(scope);
    if (posix && process.platform !== "win32") {
      const st = await fs.lstat(dir);
      if (st.isSymbolicLink() || !st.isDirectory()) {
        await fs.unlink(dir);
        return;
      }
      await new Promise<void>((resolve) => {
        // Exits non-zero when it cannot remove `dir` itself (its parent is root's); that is expected.
        execFile(fs.existsSync("/bin/rm") ? "/bin/rm" : "rm", ["-rf", "--", dir], { uid: Number(posix[1]), gid: Number(posix[2]), timeout: 10 * 60 * 1000 }, () => resolve());
      });
      await fs.rmdir(dir).catch((err: any) => {
        if (err?.code !== "ENOENT") throw new Error(`Could not remove ${dir}: ${err?.code ?? err}`);
      });
      return;
    }
    // Windows: the account only has read/run on it, so the daemon removes it.
    await fs.remove(dir);
  }

  async removeJava(id: string) {
    const java = this.getJava(id);
    if (!java) throw new Error($t("TXT_CODE_77ce8542"));

    // if (java.info.downloading) throw new Error($t("TXT_CODE_887fee99"));
    if (java.usingInstances.length) throw new Error($t("TXT_CODE_ea8ea5d1"));

    let javaPath = java.path;
    if (!javaPath) throw new Error($t("TXT_CODE_82c8bca3"));

    if (java.scope) {
      await this.removeRuntimeFolder(javaPath, java.scope);
      await fs.remove(path.join(this.accountsDir(), java.scope, `${java.info.fullname}.json`));
    } else {
      await fs.remove(javaPath);
    }
    this.javaList.delete(id);

    return true;
  }
}

const javaManager = new JavaManager();

InstanceSubsystem.on("open", (obj: { instanceUuid: string }) => {
  const instanceUuid = obj.instanceUuid;
  const config = InstanceSubsystem.getInstance(instanceUuid)?.config;
  if (!config) return;

  const javaId = config.java.id;
  if (!javaId) return;

  const java = javaManager.getJava(javaId);
  if (java && !java.usingInstances.includes(instanceUuid)) java.usingInstances.push(instanceUuid);
});

const handleStopInstance = (obj: { instanceUuid: string }) => {
  const instanceUuid = obj.instanceUuid;
  const config = InstanceSubsystem.getInstance(instanceUuid)?.config;
  if (!config) return;

  const javaId = config.java.id;
  if (!javaId) return;

  const java = javaManager.getJava(javaId);
  if (java && !java.usingInstances.includes(instanceUuid))
    java.usingInstances.filter((uuid) => uuid !== instanceUuid);
};

InstanceSubsystem.on("exit", handleStopInstance);
InstanceSubsystem.on("failure", handleStopInstance);

export default javaManager;
