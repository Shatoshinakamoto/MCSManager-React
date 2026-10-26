/**
 * Keeps files the daemon writes into an instance workspace owned by the
 * instance's account: its OS account binding (service/os_account_binding.ts)
 * or else its "Run As" user. Used by uploads, extraction, and the file
 * manager's create, edit, copy, move, compress and URL download handlers
 * (routers/file_router.ts), and by mod installs.
 *
 * SECURITY:
 * - Bound instances fail closed: when the bound account cannot be resolved
 *   the write is refused before anything is written (callers resolve first).
 * - On Linux every change goes through tools/owner_tree.ts, which reaches
 *   the target one folder at a time through /proc/self/fd and never follows
 *   a link (CWE-59, CWE-367). Elsewhere the older path-based check below
 *   is used: containment by real path, O_NOFOLLOW on the last component and
 *   a device/inode re-check.
 * SECURITY-WARNING: the path-based fallback (macOS) can still be raced by
 * a process that swaps a folder in the middle of the path.
 * TODO(security): an openat-style walk for macOS.
 */
import fs from "fs-extra";
import { constants as fsConstants } from "fs";
import path from "path";
import type Instance from "../entity/instance/instance";
import { $t } from "../i18n";
import { boundIdentity } from "./os_account";
import { fdPathsSupported, ownBeneath } from "./owner_tree";
import { effectiveRunAsName, getLinuxSystemId } from "./system_user";

export interface FileOwnership {
  uid: number;
  gid: number;
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep))
  );
}

function parseId(value: string, label: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 0 || id >= 0xffffffff) {
    throw new Error($t("TXT_CODE_file_ownership.invalidId", { label }));
  }
  return id;
}

/**
 * The owner for files written into `instance`'s workspace, or undefined to
 * leave them as written. Throws for a bound instance whose account cannot be
 * resolved or is no longer allowed (fail closed).
 */
export async function resolveInstanceFileOwnership(
  instance: Instance
): Promise<FileOwnership | undefined> {
  if (process.platform === "win32") return undefined;

  // An OS account binding wins and never falls back (Windows uses the folder grant instead).
  if (instance.config.osAccount) {
    const id = await boundIdentity(instance);
    return id?.kind === "posix" ? { uid: id.uid, gid: id.gid } : undefined;
  }

  // Docker instances use their own runAs only; host processes also fall back to johnnykins.runAs.defaultUser.
  const runAs =
    instance.config.processType === "docker"
      ? String(instance.config.runAs || "").trim()
      : effectiveRunAsName(instance.config.runAs);
  if (!runAs) return undefined;

  const numericIds = runAs.match(/^(\d+):(\d+)$/);
  if (numericIds) {
    return {
      uid: parseId(numericIds[1], "UID"),
      gid: parseId(numericIds[2], "GID")
    };
  }

  // Docker accepts forms such as a numeric UID or user:group, but the Daemon
  // cannot determine their container-side primary GID from the host.
  if (/^\d+$/.test(runAs) || runAs.includes(":")) return undefined;

  try {
    return await getLinuxSystemId(runAs);
  } catch {
    // Keep file operations working when runAs itself cannot be resolved.
    return undefined;
  }
}

/** Gives `target` (inside `workspaceRoot`) to `ownership`; links and special files are skipped. */
export async function syncPathOwnershipWithinRoot(
  workspaceRoot: string,
  target: string,
  ownership: FileOwnership
): Promise<void> {
  if (fdPathsSupported()) {
    const r = await ownBeneath(workspaceRoot, target, ownership, false);
    if (r.failed) throw new Error($t("TXT_CODE_file_ownership.targetChanged"));
    return;
  }
  const rootPath = path.resolve(workspaceRoot);
  const targetPath = path.resolve(target);
  if (!isInside(rootPath, targetPath)) {
    throw new Error($t("TXT_CODE_file_ownership.invalidTarget"));
  }

  const rootRealPath = await fs.realpath(rootPath);
  const targetInfo = await fs.lstat(targetPath);
  const pathToValidate = targetInfo.isSymbolicLink() ? path.dirname(targetPath) : targetPath;
  const targetRealPath = await fs.realpath(pathToValidate);
  if (!isInside(rootRealPath, targetRealPath)) {
    throw new Error($t("TXT_CODE_file_ownership.outsideWorkspace"));
  }

  // Node cannot safely chown a symlink through a directory descriptor. Its owner
  // does not control access to the target, so leave symlinks and special files alone.
  if (!targetInfo.isFile() && !targetInfo.isDirectory()) return;

  const flags =
    fsConstants.O_RDONLY |
    fsConstants.O_NOFOLLOW |
    fsConstants.O_NONBLOCK |
    (targetInfo.isDirectory() ? fsConstants.O_DIRECTORY : 0);
  const fd = await fs.open(targetPath, flags);
  try {
    const openedInfo = await fs.fstat(fd);
    if (openedInfo.dev !== targetInfo.dev || openedInfo.ino !== targetInfo.ino) {
      throw new Error($t("TXT_CODE_file_ownership.targetChanged"));
    }
    await fs.fchown(fd, ownership.uid, ownership.gid);
  } finally {
    await fs.close(fd);
  }
}

/**
 * Gives `target` and, when it is a folder, everything below it to
 * `ownership` (owner only; modes are kept). Used for copied and newly
 * created folder trees.
 */
export async function syncTreeOwnershipWithinRoot(
  workspaceRoot: string,
  target: string,
  ownership: FileOwnership
): Promise<void> {
  if (fdPathsSupported()) {
    const r = await ownBeneath(workspaceRoot, target, ownership, true);
    if (r.failed) throw new Error(`${r.failed} entries below ${target} could not be given to uid ${ownership.uid}`);
    return;
  }
  await syncPathOwnershipWithinRoot(workspaceRoot, target, ownership);
  let st: fs.Stats;
  try {
    st = await fs.lstat(target);
  } catch {
    return;
  }
  if (!st.isDirectory()) return;
  for (const name of await fs.readdir(target)) {
    await syncTreeOwnershipWithinRoot(workspaceRoot, path.join(target, name), ownership);
  }
}

/**
 * The topmost part of `target` that does not exist yet (so a later tree
 * sync covers every folder a recursive create makes), or `target` itself
 * when its parent exists. Stops at `root`.
 */
export function firstMissingPath(root: string, target: string): string {
  const top = path.resolve(root);
  let cur = path.resolve(target);
  for (;;) {
    const parent = path.dirname(cur);
    if (parent === cur || parent === top || !isInside(top, parent) || fs.existsSync(parent)) return cur;
    cur = parent;
  }
}

/**
 * Resolves the owner first (refusing bound instances whose account is gone),
 * runs `write`, then hands `created` (a file or a new folder tree) over.
 */
export async function writeAsInstanceOwner<T>(instance: Instance, created: string, write: () => Promise<T> | T): Promise<T> {
  const ownership = await resolveInstanceFileOwnership(instance);
  const topCreated = firstMissingPath(instance.absoluteCwdPath(), created);
  const result = await write();
  if (ownership) await syncTreeOwnershipWithinRoot(instance.absoluteCwdPath(), topCreated, ownership);
  return result;
}

export async function syncInstancePathOwnership(
  instance: Instance,
  target: string,
  ownership?: FileOwnership
): Promise<void> {
  const resolvedOwnership = ownership ?? (await resolveInstanceFileOwnership(instance));
  if (!resolvedOwnership) return;
  await syncPathOwnershipWithinRoot(instance.absoluteCwdPath(), target, resolvedOwnership);
}
