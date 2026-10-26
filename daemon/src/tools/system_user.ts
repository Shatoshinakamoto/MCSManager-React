/**
 * "Run as" support: start an instance under another OS account (Linux and
 * macOS). Upstream feature, hardened in this port:
 * - The daemon can only switch accounts when it runs as root. A non-root
 *   daemon now refuses with a clear message instead of failing with EPERM.
 * - `johnnykins.runAs` (data/Config/global.json) limits the accounts:
 *   `allowedUsers` (empty = any), `allowRoot` (default false: an instance may
 *   not be set to run as uid 0) and `defaultUser` (instances with no runAs
 *   run as this account instead of the daemon's own, i.e. root).
 * - Only a panel Web Admin can set runAs (panel: service/run_as_policy.ts),
 *   and market templates cannot carry one (daemon: Instance_router).
 *
 * SECURITY: NIST AC-6 (least privilege), CWE-250 (execution with unnecessary
 * privileges), CWE-269. The account lookup uses execFile with "--", so a name
 * can never become an option or a shell command (CWE-78, CWE-88).
 */
import { promisify } from "util";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { globalConfiguration } from "../entity/config";
import Instance from "../entity/instance/instance";
import { chown } from "fs/promises";
import { $t } from "../i18n";

// Promisify the exec function to use async/await
const execFileAsync = promisify(execFile);

/** Accepted runAs values: a POSIX portable account name (never starting with "-") or a numeric uid. */
export const RUN_AS_NAME_PATTERN = /^(?:[A-Za-z_][A-Za-z0-9_-]{0,31}|\d{1,10})$/;

export interface RunAsPolicy {
  defaultUser: string;
  allowedUsers: string[];
  allowRoot: boolean;
}

export function runAsPolicy(): RunAsPolicy {
  const p = globalConfiguration.config.johnnykins?.runAs ?? ({} as Partial<RunAsPolicy>);
  return {
    defaultUser: String(p.defaultUser ?? "").trim(),
    allowedUsers: Array.isArray(p.allowedUsers) ? p.allowedUsers.map((u) => String(u).trim()).filter(Boolean) : [],
    allowRoot: p.allowRoot === true
  };
}

/** True when this daemon can start processes as another account (root on Linux/macOS). */
export function runAsSupported(): boolean {
  return process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() === 0;
}

/** The account an instance should run as: its own runAs, else the daemon's defaultUser. */
export function effectiveRunAsName(runAs: unknown, policy = runAsPolicy()): string {
  return String(runAs ?? "").trim() || policy.defaultUser;
}

/**
 * Throws unless `name` (resolved to `uid`) may be used. `daemonUid` is the
 * daemon's own uid; switching to it needs no privilege, so it is always fine.
 */
export function assertRunAsAllowed(name: string, uid: number, policy: RunAsPolicy, daemonUid: number | undefined, isRoot: boolean) {
  if (policy.allowedUsers.length > 0 && !policy.allowedUsers.includes(name)) {
    throw new Error(`"Run As User" refused: "${name}" is not in this daemon's johnnykins.runAs.allowedUsers.`);
  }
  if (uid === 0 && !policy.allowRoot) {
    throw new Error(`"Run As User" refused: "${name}" is root (uid 0) and johnnykins.runAs.allowRoot is off.`);
  }
  if (!isRoot && uid !== daemonUid) {
    throw new Error(
      `"Run As User" needs the daemon to run as root. This daemon runs as uid ${daemonUid ?? "unknown"}, so it cannot start "${name}". Clear the instance's "Run As" field or run the daemon as root (docs/install-guide.md).`
    );
  }
}

/**
 * Retrieves the Linux system UID and GID for a given username
 */
export async function getLinuxSystemId(username: string): Promise<{ uid: number; gid: number }> {
  // Validate input: ensure username is a non-empty string
  if (!username || typeof username !== "string" || username.trim() === "") {
    throw new Error('"Run As User" Error: Username must be a non-empty string');
  }

  // Only portable account names (CWE-78, CWE-88): a leading "-" would be read as an option of `id`.
  const sanitizedUsername = username;
  if (!RUN_AS_NAME_PATTERN.test(sanitizedUsername)) {
    throw new Error('"Run As User" Error: Username contains unsafe characters');
  }

  try {
    // Execute `id -u` and `id -g` commands in parallel with a 5-second timeout
    const [uidResult, gidResult] = await Promise.all([
      execFileAsync("id", ["-u", "--", sanitizedUsername], { timeout: 5000 }),
      execFileAsync("id", ["-g", "--", sanitizedUsername], { timeout: 5000 })
    ]);

    // Check for errors in stderr
    if (uidResult.stderr || gidResult.stderr) {
      throw new Error(`Command error: ${uidResult.stderr || gidResult.stderr}`);
    }

    // Parse UID and GID from command output
    const uid = parseInt(uidResult.stdout.trim());
    const gid = parseInt(gidResult.stdout.trim());

    // Validate parsed UID and GID
    if (isNaN(uid) || isNaN(gid)) {
      throw new Error("Failed to parse UID or GID: Invalid output from id command");
    }

    return { uid, gid };
  } catch (error: any) {
    throw new Error(`Unable to retrieve UID/GID for user "${sanitizedUsername}": ${error.message}`);
  }
}

/**
 * First folder on the way to `dir` that `uid`/`gid` cannot enter (parents need
 * search permission, `dir` itself also write), or undefined when all is fine.
 * Supplementary groups are not known here, so callers treat a hit as a hint.
 */
export function findBlockingPath(dir: string, uid: number, gid: number): string | undefined {
  const target = path.resolve(dir);
  const parts: string[] = [];
  let cur = target;
  for (;;) {
    parts.unshift(cur);
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  for (const p of parts) {
    let st: fs.Stats;
    try {
      st = fs.statSync(p);
    } catch {
      return undefined; // does not exist yet; the start itself reports that
    }
    const need = p === target ? 3 : 1; // wx for the instance folder, x for parents
    const bits = st.uid === uid ? (st.mode >> 6) & 7 : st.gid === gid ? (st.mode >> 3) & 7 : st.mode & 7;
    if ((bits & need) !== need) return p;
  }
  return undefined;
}

export async function getRunAsUserParams(instance: Instance) {
  // Get user info for the target user (Linux/macOS only). Windows ignores runAs, as upstream does.
  let uid: number | undefined = undefined;
  let gid: number | undefined = undefined;
  let isEnableRunAs = false;
  const policy = runAsPolicy();
  const name = effectiveRunAsName(instance.config.runAs, policy);
  if (name && process.platform !== "win32") {
    const result = await getLinuxSystemId(name);
    const daemonUid = typeof process.getuid === "function" ? process.getuid() : undefined;
    assertRunAsAllowed(name, result.uid, policy, daemonUid, runAsSupported());
    // Switching to the daemon's own account is a no-op; skip it so a non-root daemon still starts.
    if (result.uid !== daemonUid) {
      uid = result.uid;
      gid = result.gid;
      isEnableRunAs = true;
      const blocked = instance.hasCwdPath() ? findBlockingPath(instance.absoluteCwdPath(), result.uid, result.gid) : undefined;
      if (blocked) {
        instance.println(
          "WARN",
          `"${name}" may not be able to open ${blocked}. If the instance fails to start, give that account access, e.g. sudo chown -R ${name}: "${instance.absoluteCwdPath()}" (docs/install-guide.md).`
        );
      }
    }
    // Upstream deliberately does not chown the instance folder here (it could
    // surprise users); the file manager keeps new files owned by this account.
  }
  return { uid, gid, isEnableRunAs, runAsName: name };
}
