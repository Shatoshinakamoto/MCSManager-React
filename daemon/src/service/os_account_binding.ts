/**
 * OS account bindings: which host account an instance belongs to, set by the
 * panel when its users are linked to OS accounts (panel:
 * service/os_account_service.ts). Behind the daemon routes
 * `instance/os_account/check` and `instance/os_account/apply`
 * (routers/os_account_router.ts), the start-time and after-install
 * hand-over, and the effective identity used by starts, Docker, file writes
 * and the Java Manager. See docs/features/os-user-accounts.md and
 * openspec/changes/link-panel-users-to-os-accounts/design.md.
 *
 * A binding is stored only after every check passed and the workspace was
 * handed over with no failures. Clearing it changes no files on POSIX; on
 * Windows the folder grant the daemon added is removed.
 *
 * SECURITY:
 * - The panel sends account names only; uids, gids and SIDs are always
 *   looked up here (NIST AC-6; CWE-269).
 * - Fails closed: a bound instance whose account is gone or no longer
 *   allowed does not start and refuses file writes (CWE-636).
 * - One identity per instance and no overlapping workspaces between
 *   different identities, so one account can never be handed another
 *   tenant's files (CWE-732).
 * - Folders above the workspace are reported, never changed.
 *
 * SECURITY-WARNING: a linked account owns everything in its workspace,
 * including start scripts; link only accounts you would trust with that
 * server. Unlinking on POSIX leaves file owners as they are.
 */
import fs from "fs-extra";
import path from "path";
import Instance from "../entity/instance/instance";
import {
  assertBindingAllowed,
  blockingAncestor,
  boundIdentity,
  blockingHint,
  handOverRoots,
  identityKey,
  isStrictlyBelow,
  isValidOsAccountName,
  pathsOverlap,
  resolveOsAccount,
  sameIdentity,
  type OsIdentity
} from "../tools/os_account";
import { countForeignEntries, describeTreeResult, fdPathsSupported, handOverOpenTree, openTopFolder, type TreeResult } from "../tools/owner_tree";
import { grantFolder, revokeFolder } from "../tools/windows_acl";
import logger from "./log";
import InstanceSubsystem from "./system_instance";

export { boundIdentity };

export interface BindingPlan {
  /** Normalised names, first one is stored. Empty = clear the binding. */
  accounts: string[];
  identity?: OsIdentity;
  /** True when the instance's identity changes. */
  identityChanges: boolean;
  /** Real path of the workspace. */
  workspace?: string;
  /** POSIX: walk and hand the workspace over on apply. */
  walk: boolean;
  warnings: string[];
}

export interface BindingResult extends BindingPlan {
  tree?: TreeResult;
}

const MAX_ACCOUNTS = 64;
const locks = new Map<string, Promise<unknown>>();

/** Runs `fn` after every earlier call for the same instance finished. */
function withInstanceLock<T>(uuid: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(uuid) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(uuid, next);
  return next.finally(() => {
    if (locks.get(uuid) === next) locks.delete(uuid);
  });
}

/** Trims, validates and de-duplicates account names (case-insensitively on Windows). */
export function normaliseAccounts(input: unknown, platform: NodeJS.Platform = process.platform): string[] {
  if (!Array.isArray(input)) throw new Error("accounts must be a list of OS account names.");
  if (input.length > MAX_ACCOUNTS) throw new Error(`At most ${MAX_ACCOUNTS} accounts can share an instance.`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const name = typeof raw === "string" ? raw.trim() : "";
    if (!isValidOsAccountName(name, platform)) throw new Error(`"${String(raw).slice(0, 64)}" is not a valid OS account name.`);
    const key = platform === "win32" ? name.toLowerCase() : name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.sort();
}

/** Real path of the workspace, or of where it will be created. */
function workspaceRealPath(instance: Instance): string {
  const dir = path.resolve(instance.absoluteCwdPath());
  try {
    return fs.realpathSync(dir);
  } catch {
    const parent = fs.realpathSync(path.dirname(dir));
    return path.join(parent, path.basename(dir));
  }
}

/** Throws when another instance's workspace overlaps this one, unless it has the same identity. */
async function assertNoOverlap(instance: Instance, real: string, identity: OsIdentity) {
  for (const other of InstanceSubsystem.instances.values()) {
    if (other === instance || other.isGlobalInstance()) continue;
    let otherReal: string;
    try {
      otherReal = workspaceRealPath(other);
    } catch {
      continue;
    }
    if (!pathsOverlap(real, otherReal)) continue;
    let otherId: OsIdentity | undefined;
    try {
      otherId = await boundIdentity(other);
    } catch {
      otherId = undefined;
    }
    if (!otherId || !sameIdentity(otherId, identity)) {
      throw new Error(`The workspace ${real} overlaps the workspace of instance "${other.config.nickname}" (${other.instanceUuid}), which belongs to another account. Give each instance its own folder first.`);
    }
  }
}

/** Validates a binding for `instance` without changing anything. */
export async function planBinding(instance: Instance, input: unknown): Promise<BindingPlan> {
  if (instance.isGlobalInstance()) throw new Error("The host terminal instance cannot be linked to an OS account.");
  const accounts = normaliseAccounts(input);
  const warnings: string[] = [];
  let current: OsIdentity | undefined;
  try {
    current = await boundIdentity(instance);
  } catch {
    current = undefined;
  }

  if (accounts.length === 0) {
    return { accounts, identityChanges: !!instance.config.osAccount, walk: false, warnings };
  }

  // One identity for everyone sharing the instance.
  const resolved: Array<{ name: string; id: OsIdentity }> = [];
  for (const name of accounts) {
    const id = await resolveOsAccount(name);
    assertBindingAllowed(name, id);
    resolved.push({ name, id });
  }
  const identity = resolved[0].id;
  const odd = resolved.find((r) => !sameIdentity(r.id, identity));
  if (odd) {
    throw new Error(`The accounts ${resolved.map((r) => `"${r.name}" (${identityKey(r.id)})`).join(", ")} are different OS identities; users sharing an instance must all be linked to the same one.`);
  }
  const identityChanges = !sameIdentity(current, identity);

  const real = workspaceRealPath(instance);
  const roots = handOverRoots(InstanceSubsystem.getInstanceDataDir());
  const inRoots = roots.some((r) => isStrictlyBelow(r, real));
  await assertNoOverlap(instance, real, identity);

  if (identity.kind === "windows") {
    if (!inRoots) throw new Error(`The workspace ${real} is outside the instance data folder and johnnykins.runAs.handOverPaths, so the daemon will not grant access to it.`);
    return { accounts, identity, identityChanges, workspace: real, walk: false, warnings };
  }

  if (identityChanges && instance.status() !== Instance.STATUS_STOP) {
    throw new Error(`Stop instance "${instance.config.nickname}" before linking it to "${accounts[0]}"; a running process keeps its account.`);
  }
  const blocked = blockingAncestor(real, identity.uid, identity.gid);
  if (blocked) throw new Error(blockingHint(blocked, accounts[0]));

  let walk = inRoots;
  const exists = fs.existsSync(real);
  if (!inRoots) {
    const st = exists ? fs.lstatSync(real) : undefined;
    if (!st || st.uid !== identity.uid) {
      throw new Error(`The workspace ${real} is outside the instance data folder and johnnykins.runAs.handOverPaths, and "${accounts[0]}" does not own it. Add its parent folder to handOverPaths or run: sudo chown -R ${accounts[0]}: "${real}"`);
    }
    warnings.push(`The workspace is outside the hand-over folders; it was not walked.`);
  }
  if (walk && !fdPathsSupported()) {
    // macOS and other systems: no race-free walk, so only accept a tree that is already right.
    walk = false;
    const foreign = exists ? await countForeignEntries(real, identity) : 0;
    if (foreign > 0) {
      throw new Error(`${foreign} entries in ${real} are not owned by "${accounts[0]}", and this system cannot hand folders over safely. Run: sudo chown -R ${accounts[0]}: "${real}"`);
    }
  }
  return { accounts, identity, identityChanges, workspace: real, walk, warnings };
}

/**
 * Hands the workspace of a POSIX-bound instance to `identity` (Linux).
 * The folder is opened once and checked by the path read back from its
 * descriptor, so it is the folder that was validated.
 */
export async function handOverWorkspace(instance: Instance, identity: Extract<OsIdentity, { kind: "posix" }>): Promise<TreeResult> {
  const dir = instance.absoluteCwdPath();
  const roots = handOverRoots(InstanceSubsystem.getInstanceDataDir());
  if (!fs.existsSync(dir)) {
    const parent = fs.realpathSync(path.dirname(path.resolve(dir)));
    if (!roots.some((r) => r === parent || isStrictlyBelow(r, parent))) throw new Error(`The workspace ${dir} does not exist.`);
    await fs.mkdirs(dir);
  }
  const top = await openTopFolder(dir);
  try {
    if (!roots.some((r) => isStrictlyBelow(r, top.realPath))) {
      throw new Error(`The workspace ${top.realPath} is outside the instance data folder and johnnykins.runAs.handOverPaths.`);
    }
    return await handOverOpenTree(top.fd, identity, { mode: "handOver", closeTop: true });
  } finally {
    await fs.close(top.fd).catch(() => undefined);
  }
}

/** Runs `work` with the instance marked busy (file operations and starts wait), when it is stopped. */
async function whileBusy<T>(instance: Instance, work: () => Promise<T>): Promise<T> {
  if (instance.status() !== Instance.STATUS_STOP) return work();
  instance.setLock(true);
  instance.status(Instance.STATUS_BUSY);
  try {
    return await work();
  } finally {
    instance.setLock(false);
    instance.status(Instance.STATUS_STOP);
  }
}

/** Validates, reconciles and stores a binding. Throws (storing nothing) on any failure. */
export function applyBinding(instance: Instance, input: unknown): Promise<BindingResult> {
  return withInstanceLock(instance.instanceUuid, async () => {
    const plan = await planBinding(instance, input);
    const previous = instance.config.osAccount;

    if (!plan.identity) {
      if (previous && process.platform === "win32") await revokeWindowsGrant(instance, previous, plan.warnings);
      if (previous) {
        instance.setOsAccount("");
        logger.info(`[OsAccount] Instance ${instance.instanceUuid} is no longer linked to "${previous}". File owners were left as they are.`);
      }
      return plan;
    }

    const name = plan.accounts[0];
    let tree: TreeResult | undefined;
    if (plan.identity.kind === "windows") {
      await fs.mkdirs(instance.absoluteCwdPath());
      await grantFolder(instance.absoluteCwdPath(), plan.identity.sid, "F");
      if (previous && previous.toLowerCase() !== name.toLowerCase()) await revokeWindowsGrant(instance, previous, plan.warnings, plan.identity);
    } else if (plan.walk) {
      const id = plan.identity;
      tree = await whileBusy(instance, () => handOverWorkspace(instance, id));
      const line = describeTreeResult(tree);
      if (tree.failed > 0) {
        logger.warn(`[OsAccount] Instance ${instance.instanceUuid} not linked to "${name}": ${line}`);
        throw new Error(`Could not hand the workspace to "${name}": ${line}. Nothing was linked; fix the listed entries and try again.`);
      }
      logger.info(`[OsAccount] Instance ${instance.instanceUuid} workspace handed to "${name}" (${identityKey(plan.identity)}): ${line}`);
    }
    instance.setOsAccount(name);
    return { ...plan, tree };
  });
}

async function revokeWindowsGrant(instance: Instance, previous: string, warnings: string[], keep?: OsIdentity) {
  try {
    const old = await resolveOsAccount(previous);
    if (old.kind === "windows" && !sameIdentity(old, keep)) await revokeFolder(instance.absoluteCwdPath(), old.sid);
  } catch (err: any) {
    const msg = `Could not remove the folder grant of "${previous}": ${err?.message ?? err}`;
    warnings.push(msg);
    logger.warn(`[OsAccount] ${msg}`);
  }
}

/**
 * Before a start, and after install and update tasks: hands the workspace of
 * a POSIX-bound instance over again when its top folder belongs to someone
 * else (or always, with `force`). Prints progress to the instance console.
 * Throws when the hand-over fails or is not possible.
 */
export async function reconcileBoundWorkspace(instance: Instance, reason: "start" | "install" | "update", force = false): Promise<void> {
  const id = await boundIdentity(instance);
  if (!id || id.kind !== "posix") return;
  const dir = instance.absoluteCwdPath();
  let st: fs.Stats | undefined;
  try {
    st = await fs.lstat(dir);
  } catch {
    st = undefined;
  }
  if (!force && st && st.isDirectory() && st.uid === id.uid && st.gid === id.gid) return;
  if (!fdPathsSupported()) {
    throw new Error(`The workspace of this instance is not owned by "${instance.config.osAccount}", and this system cannot hand folders over safely. Run: sudo chown -R ${instance.config.osAccount}: "${dir}"`);
  }
  instance.println("INFO", `Handing the workspace to the OS account "${instance.config.osAccount}" (${reason})...`);
  const tree = await handOverWorkspace(instance, id);
  const line = describeTreeResult(tree);
  instance.println(tree.failed ? "ERROR" : "INFO", `Workspace hand-over: ${line}`);
  if (tree.failed) throw new Error(`Could not hand the workspace to "${instance.config.osAccount}": ${line}`);
}

/**
 * After an install or update task of a bound POSIX instance: hands
 * everything the task wrote (as the daemon) to the bound account before the
 * instance leaves the busy state. Errors are printed, not thrown: the task
 * itself already finished, and the next start retries the hand-over.
 */
export async function handBackAfterTask(instance: Instance, reason: "install" | "update"): Promise<void> {
  if (!instance.config.osAccount || process.platform === "win32") return;
  try {
    await reconcileBoundWorkspace(instance, reason, true);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    instance.println("ERROR", msg);
    logger.warn(`[OsAccount] Instance ${instance.instanceUuid} after ${reason}: ${msg}`);
  }
}
