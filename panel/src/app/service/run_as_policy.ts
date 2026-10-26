/**
 * Who may choose the OS account an instance runs as ("Run As", instance
 * config key `runAs`).
 *
 * Only a Web Admin/Owner (permission 20) may set or change it, whether or
 * not Web Admin enforcement is on: picking the OS account is a host-level
 * decision, above managing instances (NIST AC-6 least privilege, AC-5
 * separation of duties; CWE-269). For anyone else the key is removed before
 * the request reaches the daemon, so a create gets no runAs and an update
 * keeps the instance's current value (the daemon only changes keys it is
 * sent).
 *
 * The daemon enforces the rest: it can switch accounts only when it runs as
 * root, and its `johnnykins.runAs` settings limit which accounts are allowed
 * (daemon/src/tools/system_user.ts). See docs/features/run-as-user.md.
 */
import Koa from "koa";
import { ROLE } from "../entity/user";
import { logger } from "./log";
import { getUserFromCtx } from "./passport_service";

/** True when the logged-in user (or API key owner) is a Web Admin. */
export function canSetRunAs(ctx: Koa.ParameterizedContext): boolean {
  const user = getUserFromCtx(ctx);
  return !!user && Number(user.permission) >= ROLE.WEBADMIN;
}

/**
 * Removes `runAs` from an instance config sent by someone who may not set
 * it. Returns true when a value was removed.
 */
export function applyRunAsPolicy(ctx: Koa.ParameterizedContext, config: any): boolean {
  if (!config || typeof config !== "object" || !("runAs" in config)) return false;
  if (canSetRunAs(ctx)) {
    config.runAs = String(config.runAs ?? "").trim();
    return false;
  }
  const had = String(config.runAs ?? "").trim() !== "";
  delete config.runAs;
  if (had) {
    const user = getUserFromCtx(ctx);
    logger.warn(`[RunAs] Ignored a "Run As" value from ${user?.userName ?? "unknown"}: only Web Admins can set it.`);
  }
  return had;
}
