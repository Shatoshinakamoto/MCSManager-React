/**
 * Daemon routes for OS account bindings, called only by the panel (the
 * socket is authenticated with the daemon key in auth_router.ts) when a Web
 * Admin links panel users to OS accounts or changes who holds an instance:
 *
 * - instance/os_account/check {instanceUuid, accounts}: validates, changes nothing.
 * - instance/os_account/apply {instanceUuid, accounts}: validates, hands the
 *   workspace over, then stores the binding. An empty list clears it.
 *
 * Logic: service/os_account_binding.ts. Docs: docs/features/os-user-accounts.md.
 *
 * SECURITY: the payload carries account names only; uids, gids and SIDs are
 * looked up on this host (CWE-269). Errors go back to the panel, which shows
 * them to the Web Admin who made the change; they never contain secrets.
 */
import { $t } from "../i18n";
import { applyBinding, planBinding } from "../service/os_account_binding";
import * as protocol from "../service/protocol";
import { routerApp } from "../service/router_app";
import InstanceSubsystem from "../service/system_instance";

function instanceFrom(data: any) {
  const instance = InstanceSubsystem.getInstance(String(data?.instanceUuid ?? ""));
  if (!instance) throw new Error($t("TXT_CODE_3bfb9e04"));
  return instance;
}

function summary(plan: { accounts: string[]; identity?: unknown; identityChanges: boolean; workspace?: string; walk: boolean; warnings: string[] }) {
  return {
    platform: process.platform,
    accounts: plan.accounts,
    bound: plan.accounts[0] ?? "",
    identity: plan.identity,
    identityChanges: plan.identityChanges,
    workspace: plan.workspace,
    walk: plan.walk,
    warnings: plan.warnings
  };
}

routerApp.on("instance/os_account/check", async (ctx, data) => {
  try {
    const plan = await planBinding(instanceFrom(data), data?.accounts);
    protocol.response(ctx, summary(plan));
  } catch (err: any) {
    protocol.responseError(ctx, err, { disablePrint: true });
  }
});

routerApp.on("instance/os_account/apply", async (ctx, data) => {
  try {
    const result = await applyBinding(instanceFrom(data), data?.accounts);
    protocol.response(ctx, { ...summary(result), tree: result.tree });
  } catch (err: any) {
    protocol.responseError(ctx, err, { disablePrint: true });
  }
});
