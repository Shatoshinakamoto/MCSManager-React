/**
 * OS accounts linked to panel users ("bindings"): which names are accepted,
 * how a name becomes a host identity, the daemon's limits on it, where a
 * workspace may be handed over, whether the account can reach a folder, and
 * the identity a bound instance runs as (boundIdentity). Checking and
 * applying a binding lives in service/os_account_binding.ts. See
 * docs/features/os-user-accounts.md and
 * openspec/changes/link-panel-users-to-os-accounts/.
 *
 * SECURITY:
 * - Names are checked against a fixed pattern before any lookup; numeric ids
 *   are refused, so the panel can never pick a uid (NIST AC-6; CWE-269).
 * - POSIX lookups use `id -u -- name` through execFile (CWE-78, CWE-88).
 * - uid 0 is refused for a binding even when johnnykins.runAs.allowRoot is
 *   on: a panel user is never linked to root (CWE-250).
 * - Workspaces are only handed over strictly below the instance data folder
 *   or a johnnykins.runAs.handOverPaths entry, so an instance whose working
 *   folder is "/" or /etc cannot give that tree away (CWE-732).
 */
import fs from "fs-extra";
import path from "path";
import { globalConfiguration } from "../entity/config";
import type Instance from "../entity/instance/instance";
import { getLinuxSystemId, runAsPolicy, type RunAsPolicy } from "./system_user";
import { lookupWindowsAccount, WINDOWS_ACCOUNT_PATTERN } from "./windows_acl";

/** POSIX account names as the panel stores them (no numeric ids). */
export const POSIX_ACCOUNT_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,31}$/;

export type OsIdentity = { kind: "posix"; uid: number; gid: number } | { kind: "windows"; sid: string };

/** True when `name` is a valid account name for `platform`. */
export function isValidOsAccountName(name: unknown, platform: NodeJS.Platform = process.platform): name is string {
  if (typeof name !== "string" || !name || /^\d+$/.test(name)) return false;
  return platform === "win32" ? WINDOWS_ACCOUNT_PATTERN.test(name) : POSIX_ACCOUNT_PATTERN.test(name);
}

/** Folder name for an identity's Java runtimes: "<uid>-<gid>" or the SID. */
export function identityKey(id: OsIdentity): string {
  return id.kind === "posix" ? `${id.uid}-${id.gid}` : id.sid;
}

export function sameIdentity(a?: OsIdentity, b?: OsIdentity): boolean {
  if (!a || !b) return !a && !b;
  return identityKey(a) === identityKey(b) && a.kind === b.kind;
}

/** Looks `name` up on this host. Throws for unknown or invalid names. */
export async function resolveOsAccount(name: string, platform: NodeJS.Platform = process.platform): Promise<OsIdentity> {
  if (!isValidOsAccountName(name, platform)) throw new Error(`"${name}" is not a valid OS account name.`);
  if (platform === "win32") return { kind: "windows", sid: await lookupWindowsAccount(name) };
  const { uid, gid } = await getLinuxSystemId(name);
  return { kind: "posix", uid, gid };
}

/** Throws unless this daemon may bind `name` (resolved to `id`). */
export function assertBindingAllowed(
  name: string,
  id: OsIdentity,
  policy: RunAsPolicy = runAsPolicy(),
  daemonUid: number | undefined = typeof process.getuid === "function" ? process.getuid() : undefined
) {
  const allowed = policy.allowedUsers;
  const caseless = id.kind === "windows";
  if (allowed.length && !allowed.some((u) => (caseless ? u.toLowerCase() === name.toLowerCase() : u === name))) {
    throw new Error(`"${name}" is not in this daemon's johnnykins.runAs.allowedUsers.`);
  }
  if (id.kind === "windows") return;
  if (id.uid === 0) throw new Error(`"${name}" is root (uid 0). Panel users can never be linked to root.`);
  if (daemonUid !== 0 && id.uid !== daemonUid) {
    throw new Error(`Linking "${name}" needs the daemon to run as root; this daemon runs as uid ${daemonUid ?? "unknown"} (docs/install-guide.md).`);
  }
}

/** Real paths of the folders whose sub-folders may be handed over. */
export function handOverRoots(instanceDataDir: string): string[] {
  const extra = globalConfiguration.config.johnnykins?.runAs?.handOverPaths;
  const list = [instanceDataDir, ...(Array.isArray(extra) ? extra : [])];
  const roots: string[] = [];
  for (const raw of list) {
    const p = String(raw ?? "").trim();
    if (!p || !path.isAbsolute(p)) continue;
    let real: string;
    try {
      real = fs.realpathSync(p);
    } catch {
      continue; // a missing folder cannot contain a workspace
    }
    if (real === path.parse(real).root) continue; // never a whole drive
    roots.push(real);
  }
  return roots;
}

/** True when `target` is strictly below `root` (both real, absolute paths). */
export function isStrictlyBelow(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return !!rel && rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel);
}

/** True when two real paths are the same or one contains the other. */
export function pathsOverlap(a: string, b: string): boolean {
  return a === b || isStrictlyBelow(a, b) || isStrictlyBelow(b, a);
}

/**
 * First folder above `realDir` that `uid`/`gid` cannot pass (no search
 * permission), or undefined. Supplementary groups do not count: Node clears
 * them when it starts a process with a uid/gid (libuv setgroups(0)), so the
 * instance will not have them either.
 */
export function blockingAncestor(realDir: string, uid: number, gid: number): string | undefined {
  const chain: string[] = [];
  let cur = path.dirname(realDir);
  for (;;) {
    chain.unshift(cur);
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  for (const p of chain) {
    let st: fs.Stats;
    try {
      st = fs.statSync(p);
    } catch {
      return p;
    }
    if (uid === 0) continue;
    const bits = st.uid === uid ? (st.mode >> 6) & 7 : st.gid === gid ? (st.mode >> 3) & 7 : st.mode & 7;
    if (!(bits & 1)) return p;
  }
  return undefined;
}

/** Hint for an administrator when a folder blocks the account. */
export function blockingHint(blocked: string, name: string) {
  return `The OS account "${name}" cannot pass the folder ${blocked}. Give other accounts search permission on it (for example: sudo chmod o+x "${blocked}") or move the data folder; the daemon does not change folders outside the workspace.`;
}

/**
 * The identity a bound instance runs and writes as, or undefined when it is
 * not bound. Throws when the binding can no longer be honoured.
 */
export async function boundIdentity(instance: Instance): Promise<OsIdentity | undefined> {
  const name = instance.config.osAccount;
  if (!name) return undefined;
  let id: OsIdentity;
  try {
    id = await resolveOsAccount(name);
  } catch (err: any) {
    throw new Error(`This instance is linked to the OS account "${name}", which cannot be used: ${err?.message ?? err}`);
  }
  try {
    assertBindingAllowed(name, id);
  } catch (err: any) {
    throw new Error(`This instance is linked to the OS account "${name}", which cannot be used: ${err?.message ?? err}`);
  }
  return id;
}
