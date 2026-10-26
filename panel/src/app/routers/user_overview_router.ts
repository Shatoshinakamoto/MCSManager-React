import Router from "@koa/router";
import Koa from "koa";
import { diffConfig } from "../common/config_diff";
import { ICompleteUser } from "../entity/entity_interface";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import { logger } from "../service/log";
import { getOperationLoggerOperator, operationLogger } from "../service/operation_logger";
import { canSetOsAccount, commitBindingChange, normaliseOsAccount } from "../service/os_account_service";
import { getUserFromCtx } from "../service/passport_service";
import userSystem from "../service/user_service";
import { assertCanGrant, assertCanManage, assertNotLastWebAdmin } from "../service/web_admin";

const router = new Router({ prefix: "/auth" });

// [Top-level Permission]
router.put("/", permission({ level: ROLE.WEBADMIN }), async (ctx: Koa.ParameterizedContext) => {
  const { uuid, config } = ctx.request.body;
  const { passWord } = config;
  // SECURITY: Web Admin accounts and the Web Admin role are managed only by Web Admins (CWE-269).
  const actor = getUserFromCtx(ctx);
  const target = userSystem.getInstance(uuid);
  assertCanManage(actor, target);
  if (config?.permission != null && config.permission !== "" && typeof config.permission !== "boolean") {
    const next = Number(config.permission);
    if (target?.permission !== next) assertCanGrant(actor, next);
    assertNotLastWebAdmin(target, next);
  }
  if (passWord && !userSystem.validatePassword(passWord))
    throw new Error($t("TXT_CODE_router.user.passwordCheck"));
  try {
    // If the administrator resets the user's password, 2FA is automatically turned off.
    if (passWord) {
      config.secret = "";
      config.open2FA = false;
    }

    const snapshotUserConfig = (userUuid: string) => {
      const user = userSystem.getInstance(userUuid);
      if (!user) return null;
      const copy = JSON.parse(JSON.stringify(user));
      delete copy.passWord;
      delete copy.passWordType;
      delete copy.salt;
      delete copy.secret;
      delete copy.apiKey;
      return copy;
    };

    // OS account link (Web Admin only) and instance assignments go through the
    // nodes first: they check and apply the binding, then the edit is stored.
    let osAccount: string | undefined;
    if (config && "osAccount" in config) {
      const requested = config.osAccount;
      delete config.osAccount;
      if (canSetOsAccount(ctx)) {
        osAccount = normaliseOsAccount(requested);
      } else if (String(requested ?? "").trim() !== (target?.osAccount ?? "")) {
        logger.warn(`[OsAccount] Ignored an OS account change from ${actor?.userName ?? "unknown"}: only Web Admins can link OS accounts.`);
      }
    }

    const userBefore = snapshotUserConfig(uuid);
    const persist = async () => {
      await userSystem.edit(uuid, config);
      if (osAccount !== undefined && osAccount !== target?.osAccount) await userSystem.setOsAccount(uuid, osAccount);
    };
    let warnings: string[] = [];
    if (target && ((osAccount !== undefined && osAccount !== target.osAccount) || config.instances)) {
      ({ warnings } = await commitBindingChange([{ uuid, osAccount, instances: config.instances }], persist));
    } else {
      await persist();
    }
    const userAfter = snapshotUserConfig(uuid);

    const diff = diffConfig(userBefore, userAfter);
    if (diff || passWord) {
      operationLogger.log(
        "user_config_change",
        {
          ...getOperationLoggerOperator(ctx),
          target_user_name: userBefore?.userName,
          password_reset: passWord ? true : undefined,
          config_before: diff?.before,
          config_after: diff?.after,
          os_account_warnings: warnings.length ? warnings : undefined
        },
        "warning"
      );
    }
    // Skipped node steps (an offline node while unlinking) are shown to the admin.
    ctx.body = warnings.length ? { warnings } : true;
  } catch (error: any) {
    ctx.throw(500, error.message);
  }
});

// [Top-level Permission]
router.get(
  "/overview",
  permission({ level: ROLE.WEBADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const users: Array<ICompleteUser> = [];
    userSystem.objects.forEach((user) => {
      users.push({
        uuid: user.uuid,
        userName: user.userName,
        permission: user.permission,
        instances: user.instances,
        loginTime: user.loginTime,
        registerTime: user.registerTime,
        osAccount: user.osAccount || ""
      });
    });
    ctx.body = users;
  }
);

export default router;
