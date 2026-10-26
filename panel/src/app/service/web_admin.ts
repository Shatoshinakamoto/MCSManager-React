/**
 * Web Admin role (ROLE.WEBADMIN = 20), ported from the Johnnykins fork.
 *
 * The fork raised panel-wide routes (daemons, Docker environment, user
 * management, settings, instance admin actions, the global file manager) from
 * Admin (10) to Web Admin (20). Here those routes are declared with
 * `permission({ level: ROLE.WEBADMIN })` and this module decides what that
 * level means at request time:
 *
 * - Enforcement on (`systemConfig.webAdminEnforced`) and at least one Web
 *   Admin exists: only Web Admins pass.
 * - Otherwise the level falls back to Admin, so an upgraded panel (whose
 *   users are all Admins) keeps working until someone is promoted.
 *
 * Granting rules (NIST AC-5 separation of duties, AC-6 least privilege):
 * - Only a Web Admin can grant or remove Web Admin, or edit/delete a Web Admin.
 * - Bootstrap: while no Web Admin exists, an Admin may promote a user (or
 *   themselves) to Web Admin. New installs create the first user as Web Admin.
 * - The last Web Admin cannot be demoted or deleted.
 *
 * SECURITY: every check here runs on the panel; the UI only mirrors it.
 */
import { ROLE, User } from "../entity/user";
import { systemConfig } from "../setting";
import userSystem from "./user_service";

export const VALID_PERMISSIONS = [ROLE.BAN, ROLE.GUEST, ROLE.USER, ROLE.ADMIN, ROLE.WEBADMIN] as number[];

export function countWebAdmins(): number {
  let n = 0;
  userSystem.objects.forEach((u) => {
    if (u && u.permission >= ROLE.WEBADMIN) n++;
  });
  return n;
}

export function hasWebAdmin(): boolean {
  return countWebAdmins() > 0;
}

/** True when Web Admin-level routes are restricted to Web Admins. */
export function isWebAdminEnforced(): boolean {
  return !!systemConfig?.webAdminEnforced && hasWebAdmin();
}

/** Level a route actually requires right now (WEBADMIN falls back to ADMIN when not enforced). */
export function effectiveLevel(level: number): number {
  if (level >= ROLE.WEBADMIN && !isWebAdminEnforced()) return ROLE.ADMIN;
  return level;
}

export function isWebAdmin(user?: User | null): boolean {
  return !!user && user.permission >= ROLE.WEBADMIN;
}

/**
 * Throws unless `actor` may give `targetPermission` to someone.
 * Unknown numbers (e.g. 99) are refused outright (CWE-269).
 */
export function assertCanGrant(actor: User | undefined | null, targetPermission: number) {
  if (!VALID_PERMISSIONS.includes(targetPermission)) throw new Error("Invalid permission level");
  if (targetPermission < ROLE.WEBADMIN) return;
  if (isWebAdmin(actor)) return;
  if (actor && actor.permission >= ROLE.ADMIN && !hasWebAdmin()) return; // bootstrap
  throw new Error("Only a Web Admin can grant the Web Admin role");
}

/** Throws unless `actor` may edit or delete `target` (Web Admins are only managed by Web Admins). */
export function assertCanManage(actor: User | undefined | null, target: User | undefined | null) {
  if (!target || !isWebAdmin(target)) return;
  if (isWebAdmin(actor)) return;
  throw new Error("Only a Web Admin can change or delete a Web Admin");
}

/** Throws if removing Web Admin from `target` (demote or delete) would leave none. */
export function assertNotLastWebAdmin(target: User | undefined | null, newPermission?: number) {
  if (!target || !isWebAdmin(target)) return;
  if (newPermission != null && newPermission >= ROLE.WEBADMIN) return;
  if (countWebAdmins() <= 1) throw new Error("The last Web Admin cannot be demoted or deleted");
}
