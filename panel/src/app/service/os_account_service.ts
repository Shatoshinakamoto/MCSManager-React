/**
 * Links panel users to host OS accounts (user field `osAccount`) and keeps
 * every daemon's instance bindings in step with it. Implements decision 3 of
 * openspec/changes/link-panel-users-to-os-accounts/design.md: for any edit
 * that changes which OS accounts hold an instance, the panel
 *   1. works out the affected (daemon, instance) pairs from the stored users,
 *   2. asks each daemon to check the new account list for each pair,
 *   3. asks each daemon to apply it (the daemon hands the workspace over),
 *   4. stores the panel change only when all of that succeeded.
 * Edits are serialised. Clearing a binding (an empty list) is best effort:
 * an offline node is skipped with a warning, because taking access away in
 * the panel must never wait for a node. Daemon side:
 * daemon/src/service/os_account_binding.ts. Docs:
 * docs/features/os-user-accounts.md.
 *
 * SECURITY:
 * - Only a Web Admin (permission 20) may set `osAccount`, whether or not Web
 *   Admin enforcement is on: choosing a host account is a host-level
 *   decision (NIST AC-5, AC-6; CWE-269), the same rule as "Run As".
 * - Only account names are stored and sent, never uids or gids; each daemon
 *   resolves them itself and refuses root (CWE-250).
 * - Names are checked against fixed POSIX/Windows patterns (no numeric ids,
 *   no shell or path characters) before anything is sent (CWE-20, CWE-88).
 * - A failed multi-node change is reported as failed, never as done.
 */
import Koa from "koa";
import { IUserApp, ROLE, User } from "../entity/user";
import { logger } from "./log";
import { getUserFromCtx } from "./passport_service";
import RemoteRequest from "./remote_command";
import RemoteServiceSubsystem from "./remote_service";
import userSystem from "./user_service";

const POSIX_NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,31}$/;
const WINDOWS_NAME = /^(?:[A-Za-z0-9][A-Za-z0-9.-]{0,14}\\)?[A-Za-z0-9_](?:[A-Za-z0-9 ._-]{0,18}[A-Za-z0-9_-])?$/;

/** Daemon calls: checks are quick lookups; applying may walk a large workspace. */
const CHECK_TIMEOUT = 60 * 1000;
const APPLY_TIMEOUT = 15 * 60 * 1000;

/** True for "" (no link) or a valid POSIX or Windows account name. */
export function isValidOsAccount(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value === "") return true;
  if (/^\d+$/.test(value)) return false;
  return POSIX_NAME.test(value) || WINDOWS_NAME.test(value);
}

/** Trims and validates an `osAccount` value; throws for invalid names. */
export function normaliseOsAccount(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : value == null ? "" : null;
  if (name === null || !isValidOsAccount(name)) {
    throw new Error("The OS account must be an account name such as \"alice\" or \"DOMAIN\\alice\" (no numeric ids, spaces at the ends or special characters).");
  }
  return name;
}

/** True when the caller is a Web Admin, the only role that may link OS accounts. */
export function canSetOsAccount(ctx: Koa.ParameterizedContext): boolean {
  const user = getUserFromCtx(ctx);
  return !!user && Number(user.permission) >= ROLE.WEBADMIN;
}

/** One user's part of an edit. Omitted fields keep their stored value. */
export interface UserBindingChange {
  uuid: string;
  osAccount?: string;
  instances?: IUserApp[];
  deleted?: boolean;
}

interface UserView {
  osAccount: string;
  instances: IUserApp[];
}

export interface AffectedPair {
  daemonId: string;
  instanceUuid: string;
  /** Distinct OS accounts holding the instance after the edit (sorted). */
  accounts: string[];
}

const pairKey = (daemonId: string, instanceUuid: string) => `${daemonId}\u0000${instanceUuid}`;

/** A node's error text without the "Error: " prefix it arrives with. */
const reason = (err: any) => String(err?.message ?? err).replace(/^(?:Error:\s*)+/, "");

/** Sorted, distinct non-empty OS accounts holding each (daemon, instance) pair. */
export function accountsByPair(users: Iterable<UserView>): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const u of users) {
    for (const app of u.instances ?? []) {
      const key = pairKey(app.daemonId, app.instanceUuid);
      if (!map.has(key)) map.set(key, new Set());
      if (u.osAccount) map.get(key)!.add(u.osAccount);
    }
  }
  const out = new Map<string, string[]>();
  for (const [k, v] of map) out.set(k, [...v].sort());
  return out;
}

/** Validates assignment entries the same way user_service.setUserInstances does. */
function checkedInstances(list: unknown): IUserApp[] {
  if (!Array.isArray(list)) throw new Error("Type error, The instances of user must be IUserHaveInstance array.");
  return list.map((v: any) => {
    if (!v?.daemonId || !v?.instanceUuid) throw new Error("Type error, The instances of user must be IUserHaveInstance array.");
    return { daemonId: String(v.daemonId), instanceUuid: String(v.instanceUuid) };
  });
}

/** Pairs whose account list differs between `before` and `after`. */
export function affectedPairs(before: Map<string, UserView>, after: Map<string, UserView>): AffectedPair[] {
  const a = accountsByPair(before.values());
  const b = accountsByPair(after.values());
  const keys = new Set([...a.keys(), ...b.keys()]);
  const out: AffectedPair[] = [];
  for (const key of keys) {
    const was = a.get(key) ?? [];
    const now = b.get(key) ?? [];
    if (was.join("\n") === now.join("\n")) continue;
    const [daemonId, instanceUuid] = key.split("\u0000");
    out.push({ daemonId, instanceUuid, accounts: now });
  }
  return out;
}

function snapshot(users: Iterable<User>): Map<string, UserView> {
  const map = new Map<string, UserView>();
  for (const u of users) map.set(u.uuid, { osAccount: u.osAccount || "", instances: (u.instances ?? []).map((i) => ({ daemonId: i.daemonId, instanceUuid: i.instanceUuid })) });
  return map;
}

function nodeName(daemonId: string) {
  const r = RemoteServiceSubsystem.getInstance(daemonId);
  return r?.config?.remarks || r?.config?.ip || daemonId;
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs edits one after another so checks and applies never interleave. */
function serialised<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => undefined).then(fn);
  queue = next;
  return next;
}

export interface CommitOptions {
  /** Report every daemon failure as a warning and store the change anyway (user deletion). */
  bestEffort?: boolean;
}

/**
 * Checks and applies the OS account bindings an edit implies, then runs
 * `persist`. Throws (without persisting) when a required daemon step fails.
 * Returns warnings for skipped best-effort steps.
 */
export function commitBindingChange(changes: UserBindingChange[], persist: () => Promise<void>, opts: CommitOptions = {}): Promise<{ warnings: string[]; pairs: AffectedPair[] }> {
  return serialised(async () => {
    const before = snapshot(userSystem.objects.values());
    const after = new Map(before);
    for (const c of changes) {
      if (c.deleted) {
        after.delete(c.uuid);
        continue;
      }
      const cur = after.get(c.uuid) ?? { osAccount: "", instances: [] };
      after.set(c.uuid, {
        osAccount: c.osAccount !== undefined ? normaliseOsAccount(c.osAccount) : cur.osAccount,
        instances: c.instances !== undefined ? checkedInstances(c.instances) : cur.instances
      });
    }
    const pairs = affectedPairs(before, after);
    const warnings: string[] = [];
    const warn = (msg: string) => {
      warnings.push(msg);
      logger.warn(`[OsAccount] ${msg}`);
    };
    const label = (p: AffectedPair) => `node "${nodeName(p.daemonId)}", instance ${p.instanceUuid}`;

    // 1. Check every pair before changing anything anywhere.
    const reachable: AffectedPair[] = [];
    const errors: string[] = [];
    for (const p of pairs) {
      const remote = RemoteServiceSubsystem.getInstance(p.daemonId);
      if (!remote?.available) {
        const msg = `${label(p)}: the node is offline`;
        if (opts.bestEffort || p.accounts.length === 0) warn(`${msg}; its link was not cleared and will be on the next change.`);
        else errors.push(msg);
        continue;
      }
      try {
        await new RemoteRequest(remote).request("instance/os_account/check", { instanceUuid: p.instanceUuid, accounts: p.accounts }, CHECK_TIMEOUT);
        reachable.push(p);
      } catch (err: any) {
        const msg = `${label(p)}: ${reason(err)}`;
        if (opts.bestEffort) warn(msg);
        else errors.push(msg);
      }
    }
    if (errors.length) throw new Error(`Nothing was changed. ${errors.join(" | ")}`);

    // 2. Apply. A failure stops the edit; pairs already applied stay applied (safe to retry).
    const applied: string[] = [];
    for (const p of reachable) {
      try {
        await new RemoteRequest(RemoteServiceSubsystem.getInstance(p.daemonId)).request(
          "instance/os_account/apply",
          { instanceUuid: p.instanceUuid, accounts: p.accounts },
          APPLY_TIMEOUT
        );
        applied.push(label(p));
      } catch (err: any) {
        const msg = `${label(p)}: ${reason(err)}`;
        if (opts.bestEffort || p.accounts.length === 0) {
          warn(msg);
          continue;
        }
        throw new Error(
          `The change was not saved. ${msg}${applied.length ? ` (already updated on the node: ${applied.join(", ")}; saving the change again finishes the rest)` : ""}`
        );
      }
    }

    // 3. Only now the panel state.
    await persist();
    if (pairs.length) logger.info(`[OsAccount] Updated ${pairs.length} instance link(s): ${pairs.map((p) => `${p.instanceUuid}=[${p.accounts.join(",")}]`).join(" ")}`);
    return { warnings, pairs };
  });
}
