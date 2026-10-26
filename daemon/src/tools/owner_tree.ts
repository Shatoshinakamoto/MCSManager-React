/**
 * Hands files inside an instance workspace (or a Java runtime) to an OS
 * account without following links: the recursive walk behind OS account
 * bindings (service/os_account_binding.ts), the per-account Java downloads
 * (service/java_manager.ts) and the file manager's ownership sync
 * (tools/file_ownership.ts). See docs/features/os-user-accounts.md.
 *
 * How it stays inside the tree on Linux: the top folder is opened once with
 * O_NOFOLLOW and every entry below it is reached through
 * /proc/self/fd/<folder fd>/<name>. The kernel resolves that path from the
 * folder the descriptor points at, not from its name, so renaming a folder
 * or swapping it for a symbolic link while the walk runs cannot send the
 * walk anywhere else. Each entry is opened with O_NOFOLLOW, checked to be
 * the entry that was listed (device and inode), and changed through its own
 * descriptor (fchown, fchmod).
 *
 * Other POSIX systems have no such path; there the walk only reports what it
 * would change (`verifyTree`) and callers refuse to hand trees over.
 *
 * SECURITY:
 * - CWE-59 / CWE-61 (link following) and CWE-367 (TOCTOU): see above. The
 *   account being handed the tree may be logged in and racing the walk.
 * - CWE-62 (hard links): files with more than one link are left alone, since
 *   another name for them may be outside the tree (/etc/shadow, say).
 * - Other mounted file systems are not entered, so a bind mount inside a
 *   workspace cannot extend it.
 * - setuid and setgid bits are removed from everything handed over.
 * SECURITY-WARNING: changing many files is not atomic. A failure part-way
 * leaves the entries already handed over as they are; callers report the
 * counts and treat the hand-over as failed, and a retry continues where it
 * stopped (the walk is idempotent).
 */
import { constants as fsConstants } from "fs";
import fs from "fs-extra";
import path from "path";
import logger from "../service/log";

export interface TreeOwner {
  uid: number;
  gid: number;
}

export interface TreeResult {
  /** Entries whose owner or mode was changed. */
  changed: number;
  /** Entries already right. */
  unchanged: number;
  /** Entries left alone on purpose: links, special files, hard-linked files, other mounts. */
  skipped: number;
  /** Entries that could not be changed. */
  failed: number;
  /** Up to 20 skipped or failed paths (relative to the top), for messages. */
  samples: string[];
}

export interface TreeOptions {
  /** "handOver": owner plus modes (handOverMode); "owner": owner only. */
  mode: "handOver" | "owner";
  /** Remove "other" access from the top folder (workspaces only). */
  closeTop?: boolean;
  /** Only report, change nothing. */
  dryRun?: boolean;
}

/** How many entries of one folder are handled at the same time. */
const PARALLEL = 32;
const MAX_SAMPLES = 20;

/** True when entries can be reached through /proc/self/fd (Linux). */
export function fdPathsSupported(): boolean {
  return process.platform === "linux" && fs.existsSync("/proc/self/fd");
}

function fdChild(dirFd: number, name: string) {
  return `/proc/self/fd/${dirFd}/${name}`;
}

/**
 * Mode for an entry handed to its new owner: read and write for the owner
 * (and search, for folders); a file that anyone could run, or that starts
 * like a program, becomes runnable by its owner; setuid and setgid go.
 */
export function handOverMode(mode: number, isDirectory: boolean, looksExecutable: boolean): number {
  let m = mode & 0o7777;
  if (isDirectory) return (m & ~0o6000) | 0o700;
  m &= ~0o6000;
  m |= 0o600;
  if (m & 0o111 || looksExecutable) m |= 0o100;
  return m;
}

/** First bytes of scripts ("#!"), ELF and Mach-O files. */
export function startsLikeProgram(head: Buffer): boolean {
  if (head.length >= 2 && head[0] === 0x23 && head[1] === 0x21) return true;
  if (head.length < 4) return false;
  const magic = head.readUInt32BE(0);
  return (
    magic === 0x7f454c46 || // ELF
    magic === 0xfeedface ||
    magic === 0xfeedfacf ||
    magic === 0xcefaedfe ||
    magic === 0xcffaedfe ||
    magic === 0xcafebabe // Mach-O and universal binaries
  );
}

function sample(result: TreeResult, rel: string, why: string) {
  if (result.samples.length < MAX_SAMPLES) result.samples.push(`${rel || "."} (${why})`);
}

function openFlags(isDirectory: boolean) {
  return fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK | (isDirectory ? fsConstants.O_DIRECTORY : 0);
}

/**
 * Applies the owner (and mode) to one opened entry. Returns true when
 * something changed.
 */
async function applyTo(fd: number, st: fs.Stats, owner: TreeOwner, opts: TreeOptions, isTop: boolean): Promise<boolean> {
  let mode = st.mode & 0o7777;
  if (opts.mode === "handOver") {
    let looksExecutable = false;
    if (st.isFile() && !(st.mode & 0o111) && st.size >= 2) {
      const head = Buffer.alloc(4);
      const { bytesRead } = await fs.read(fd, head, 0, 4, 0);
      looksExecutable = startsLikeProgram(head.subarray(0, bytesRead));
    }
    mode = handOverMode(st.mode, st.isDirectory(), looksExecutable);
  } else if (st.isFile()) {
    // Owner only: keep the mode, but never leave a setuid/setgid file behind.
    mode &= ~0o6000;
  }
  if (isTop && opts.closeTop) mode &= ~0o007;
  const ownerDiffers = st.uid !== owner.uid || st.gid !== owner.gid;
  const modeDiffers = mode !== (st.mode & 0o7777);
  if (!ownerDiffers && !modeDiffers) return false;
  if (opts.dryRun) return true;
  // chown first (Linux may clear setuid/setgid on it), then set the mode we want.
  if (ownerDiffers) await fs.fchown(fd, owner.uid, owner.gid);
  if (mode !== ((await fs.fstat(fd)).mode & 0o7777)) await fs.fchmod(fd, mode);
  return true;
}

/**
 * Walks the folder open at `dirFd` (already handled itself) and every folder
 * below it on the same device.
 */
async function walkBelow(dirFd: number, rel: string, dev: number, owner: TreeOwner, opts: TreeOptions, result: TreeResult): Promise<void> {
  let names: string[];
  try {
    names = await fs.readdir(`/proc/self/fd/${dirFd}`);
  } catch (err: any) {
    result.failed++;
    sample(result, rel, err?.code ?? "unreadable");
    return;
  }
  const folders: Array<{ name: string; st: fs.Stats }> = [];
  for (let i = 0; i < names.length; i += PARALLEL) {
    await Promise.all(
      names.slice(i, i + PARALLEL).map(async (name) => {
        const childRel = rel ? `${rel}/${name}` : name;
        let st: fs.Stats;
        try {
          st = await fs.lstat(fdChild(dirFd, name));
        } catch (err: any) {
          if (err?.code === "ENOENT") return; // removed while walking
          result.failed++;
          sample(result, childRel, err?.code ?? "lstat failed");
          return;
        }
        if (st.dev !== dev) {
          result.skipped++;
          sample(result, childRel, "other file system");
          return;
        }
        if (st.isDirectory()) {
          folders.push({ name, st });
          return;
        }
        if (!st.isFile()) {
          result.skipped++; // symbolic links, sockets, devices, FIFOs
          return;
        }
        if (st.nlink > 1) {
          result.skipped++;
          sample(result, childRel, "hard link");
          return;
        }
        let fd: number | undefined;
        try {
          fd = await fs.open(fdChild(dirFd, name), openFlags(false));
          const opened = await fs.fstat(fd);
          if (opened.dev !== st.dev || opened.ino !== st.ino || !opened.isFile() || opened.nlink > 1) {
            result.failed++;
            sample(result, childRel, "changed while walking");
            return;
          }
          if (await applyTo(fd, opened, owner, opts, false)) result.changed++;
          else result.unchanged++;
        } catch (err: any) {
          if (err?.code === "ENOENT") return;
          result.failed++;
          sample(result, childRel, err?.code ?? "failed");
        } finally {
          if (fd !== undefined) await fs.close(fd).catch(() => undefined);
        }
      })
    );
  }
  // Folders one at a time: at most (depth + PARALLEL) descriptors stay open.
  for (const { name, st } of folders) {
    const childRel = rel ? `${rel}/${name}` : name;
    let fd: number | undefined;
    try {
      fd = await fs.open(fdChild(dirFd, name), openFlags(true));
      const opened = await fs.fstat(fd);
      if (opened.dev !== st.dev || opened.ino !== st.ino) {
        result.failed++;
        sample(result, childRel, "changed while walking");
        continue;
      }
      if (await applyTo(fd, opened, owner, opts, false)) result.changed++;
      else result.unchanged++;
      await walkBelow(fd, childRel, dev, owner, opts, result);
    } catch (err: any) {
      if (err?.code === "ENOENT") continue;
      result.failed++;
      sample(result, childRel, err?.code ?? "failed");
    } finally {
      if (fd !== undefined) await fs.close(fd).catch(() => undefined);
    }
  }
}

/**
 * Opens `top` as a folder without following a final symbolic link and
 * returns its descriptor plus its real path (read back from the descriptor,
 * so it names the folder that will actually be changed).
 */
export async function openTopFolder(top: string): Promise<{ fd: number; realPath: string; stat: fs.Stats }> {
  const fd = await fs.open(path.resolve(top), openFlags(true));
  try {
    const stat = await fs.fstat(fd);
    if (!stat.isDirectory()) throw new Error(`${top} is not a folder`);
    const realPath = await fs.readlink(`/proc/self/fd/${fd}`);
    return { fd, realPath, stat };
  } catch (err) {
    await fs.close(fd).catch(() => undefined);
    throw err;
  }
}

/**
 * Hands the folder open at `topFd` and everything below it to `owner`
 * (Linux only). The caller validates the folder (openTopFolder's realPath)
 * before calling and closes the descriptor afterwards.
 */
export async function handOverOpenTree(topFd: number, owner: TreeOwner, opts: TreeOptions): Promise<TreeResult> {
  if (!fdPathsSupported()) throw new Error("Handing folders to an OS account needs Linux (/proc/self/fd).");
  const result: TreeResult = { changed: 0, unchanged: 0, skipped: 0, failed: 0, samples: [] };
  const st = await fs.fstat(topFd);
  try {
    if (await applyTo(topFd, st, owner, opts, true)) result.changed++;
    else result.unchanged++;
  } catch (err: any) {
    result.failed++;
    sample(result, "", err?.code ?? "failed");
    return result;
  }
  await walkBelow(topFd, "", st.dev, owner, opts, result);
  return result;
}

/** handOverOpenTree for a path: opens, runs, closes. */
export async function handOverTree(top: string, owner: TreeOwner, opts: TreeOptions): Promise<TreeResult> {
  const { fd } = await openTopFolder(top);
  try {
    return await handOverOpenTree(fd, owner, opts);
  } finally {
    await fs.close(fd).catch(() => undefined);
  }
}

/**
 * Opens `rel` (a path inside the folder open at `rootFd`) one component at a
 * time, never following a link. Returns the descriptor of the last component.
 */
export async function openBeneath(rootFd: number, rel: string, wantDirectory?: boolean): Promise<{ fd: number; stat: fs.Stats }> {
  const parts = rel.split(/[\\/]+/).filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..")) throw new Error(`"${rel}" leaves the folder`);
  let cur = rootFd;
  let owned = false;
  try {
    for (let i = 0; i < parts.length; i++) {
      const last = i === parts.length - 1;
      const st = await fs.lstat(fdChild(cur, parts[i]));
      const isDir = st.isDirectory();
      if (!last && !isDir) throw new Error(`"${parts.slice(0, i + 1).join("/")}" is not a folder`);
      if (last && !isDir && !st.isFile()) {
        const e: NodeJS.ErrnoException = new Error(`"${rel}" is not a plain file or folder`);
        e.code = "ESPECIAL";
        throw e;
      }
      const next = await fs.open(fdChild(cur, parts[i]), openFlags(isDir || (last && !!wantDirectory)));
      const opened = await fs.fstat(next);
      if (opened.dev !== st.dev || opened.ino !== st.ino) {
        await fs.close(next).catch(() => undefined);
        throw new Error(`"${rel}" changed while it was being opened`);
      }
      if (owned) await fs.close(cur).catch(() => undefined);
      cur = next;
      owned = true;
    }
    if (!owned) {
      // rel is the root itself: hand back a fresh descriptor the caller may close.
      const fd = await fs.open(`/proc/self/fd/${rootFd}`, openFlags(true));
      return { fd, stat: await fs.fstat(fd) };
    }
    return { fd: cur, stat: await fs.fstat(cur) };
  } catch (err) {
    if (owned) await fs.close(cur).catch(() => undefined);
    throw err;
  }
}

/**
 * Gives `target` (inside `root`) to `owner`; with `tree`, everything below a
 * target folder too (owner only, modes kept). Linux only; see file header.
 * Missing targets are ignored; links and special files are left alone.
 */
export async function ownBeneath(root: string, target: string, owner: TreeOwner, tree: boolean): Promise<TreeResult> {
  const result: TreeResult = { changed: 0, unchanged: 0, skipped: 0, failed: 0, samples: [] };
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) throw new Error(`${target} is outside ${root}`);
  const top = await openTopFolder(root);
  try {
    let opened: { fd: number; stat: fs.Stats };
    try {
      opened = await openBeneath(top.fd, rel);
    } catch (err: any) {
      if (err?.code === "ENOENT") return result;
      if (err?.code === "ESPECIAL" || err?.code === "ELOOP") {
        result.skipped++;
        return result;
      }
      throw err;
    }
    try {
      if (opened.stat.isFile() && opened.stat.nlink > 1) {
        result.skipped++;
        sample(result, rel, "hard link");
        return result;
      }
      if (await applyTo(opened.fd, opened.stat, owner, { mode: "owner" }, false)) result.changed++;
      else result.unchanged++;
      if (tree && opened.stat.isDirectory()) await walkBelow(opened.fd, rel, opened.stat.dev, owner, { mode: "owner" }, result);
    } finally {
      await fs.close(opened.fd).catch(() => undefined);
    }
  } finally {
    await fs.close(top.fd).catch(() => undefined);
  }
  return result;
}

/**
 * Read-only check for systems without /proc/self/fd: counts entries below
 * `top` not owned by `owner` (symbolic links not followed). Races only make
 * the answer stale; nothing is changed.
 */
export async function countForeignEntries(top: string, owner: TreeOwner, limit = 100000): Promise<number> {
  let foreign = 0;
  let seen = 0;
  const rootStat = await fs.lstat(top);
  const stack = [path.resolve(top)];
  while (stack.length && seen < limit) {
    const dir = stack.pop()!;
    const st = await fs.lstat(dir);
    seen++;
    if (st.uid !== owner.uid || st.gid !== owner.gid) foreign++;
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      foreign++;
      continue;
    }
    for (const name of names) {
      const p = path.join(dir, name);
      const cst = await fs.lstat(p).catch(() => undefined);
      if (!cst || cst.dev !== rootStat.dev) continue;
      if (cst.isDirectory()) stack.push(p);
      else if (cst.isFile()) {
        seen++;
        if (cst.uid !== owner.uid || cst.gid !== owner.gid) foreign++;
      }
    }
  }
  return foreign;
}

/** One log line for a result. */
export function describeTreeResult(r: TreeResult): string {
  return `${r.changed} changed, ${r.unchanged} already right, ${r.skipped} skipped, ${r.failed} failed${r.samples.length ? ` (${r.samples.slice(0, 5).join(", ")})` : ""}`;
}

export function logTreeResult(what: string, r: TreeResult) {
  (r.failed ? logger.warn : logger.info).call(logger, `[OsAccount] ${what}: ${describeTreeResult(r)}`);
}
