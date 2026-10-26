import Router from "@koa/router";
import axios from "axios";
import Koa from "koa";
import SystemConfig from "../entity/setting";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import { logger } from "../service/log";
import { operationLogger } from "../service/operation_logger";
import { check, checkBanIp, getUserFromCtx, login, logout } from "../service/passport_service";
import userSystem, { TwoFactorError } from "../service/user_service";
import { saveSystemConfig, systemConfig } from "../setting";
import { isWebAdminEnforced } from "../service/web_admin";
import { legacyPassport, parsePassportMode } from "mcsmanager-common";
import { legacyPassportStore } from "../service/johnnykins/passport_client";

const router = new Router({ prefix: "/auth" });

// [Public Permission]
// login route
router.post(
  "/login",
  permission({ token: false, level: null }),
  validator({ body: { username: String, password: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    if (systemConfig?.ssoEnabled && systemConfig?.ssoOnlyMode) {
      ctx.body = new Error("Password login is disabled. Please use SSO.");
      return;
    }
    const userName = String(ctx.request.body.username);
    const passWord = String(ctx.request.body.password);
    // `String(undefined)` would be the literal "undefined" (truthy) and defeat
    // the NEED_2FA branch below for clients that omit the field (e.g.
    // SsoBindLogin sends `code: undefined`). Normalize absent/empty to "".
    const code = ctx.request.body.code ? String(ctx.request.body.code) : "";
    if (!checkBanIp(ctx)) throw new Error($t("TXT_CODE_router.login.ban"));
    if (check(ctx)) return (ctx.body = "Logined");
    try {
      ctx.body = login(ctx, userName, passWord, code);
      operationLogger.info("user_login", {
        operator_ip: ctx.ip,
        operator_name: userName,
        login_result: true
      });
    } catch (error: any) {
      if (error instanceof TwoFactorError && !code) {
        ctx.body = "NEED_2FA";
        return;
      }
      ctx.body = error;
      operationLogger.warning("user_login", {
        operator_ip: ctx.ip,
        operator_name: userName,
        login_result: false
      });
    }
  }
);

// [Public Permission]
// exit route
router.get(
  "/logout",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    logout(ctx);
    ctx.body = true;
  }
);

// [Public Permission]
// Display the text of the login interface
router.all(
  "/login_info",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    ctx.body = {
      loginInfo: systemConfig?.loginInfo
    };
  }
);

// [Public Permission]
// Get the state information that the panel can expose
router.all(
  "/status",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    let isInstall = true;
    if (userSystem.objects.size === 0) {
      isInstall = false;
    }

    const settings: Partial<SystemConfig> = {
      businessMode: systemConfig?.businessMode || false,
      businessId: systemConfig?.businessId || "",
      // Public on purpose: the dev-tools blocker must load before login.
      devBlocker: systemConfig?.devBlocker || false
    };
    const user = getUserFromCtx(ctx);
    if (user && user.permission >= ROLE.USER) {
      settings.canFileManager = systemConfig?.canFileManager || false;
      settings.allowUsePreset = systemConfig?.allowUsePreset || false;
      settings.allowChangeCmd = systemConfig?.allowChangeCmd || false;
      settings.panelId = systemConfig?.panelId || "";
      settings.ssoEnabled = systemConfig?.ssoEnabled || false;
      // Effective value: enforcement only applies once a Web Admin exists.
      settings.webAdminEnforced = isWebAdminEnforced();
    }

    ctx.body = {
      isInstall,
      language: systemConfig?.language || null,
      settings
    };
  }
);

// [Public Permission]
// Install the panel, only available when the number of user entities is 0
router.all(
  "/install",
  permission({ token: false, level: null }),
  validator({ body: { username: String, password: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    const userName = String(ctx.request.body.username);
    const passWord = String(ctx.request.body.password);
    if (userSystem.objects.size === 0) {
      if (!userSystem.validatePassword(passWord))
        throw new Error($t("TXT_CODE_router.user.passwordCheck"));
      logger.info($t("TXT_CODE_router.login.init", { userName }));
      // Johnnykins fork: the installing user is the Web Admin, and Web Admin
      // enforcement starts on for new panels (service/web_admin.ts).
      await userSystem.create({
        userName,
        passWord,
        permission: ROLE.WEBADMIN
      });
      if (systemConfig) {
        systemConfig.webAdminEnforced = true;
        saveSystemConfig(systemConfig);
      }
      operationLogger.log("user_create", {
        operator_ip: ctx.ip,
        operator_name: userName,
        target_user_name: userName
      });
      login(ctx, userName, passWord);
      return (ctx.body = true);
    }
    throw new Error($t("TXT_CODE_router.user.installed"));
  }
);

router.all(
  "/proxy",
  validator({ query: { target: String } }),
  permission({ level: ROLE.ADMIN }),
  async (ctx) => {
    try {
      const response = await axios.request({
        method: (ctx.query.method as string) || ctx.method,
        url: String(ctx.query.target)
      });
      if (response.status !== 200) throw new Error("Response code != 200");
      ctx.body = response.data;
    } catch (err) {
      ctx.body = err;
    }
  }
);

// [Public Permission]
// Johnnykins legacy mode: a daemon asks whether this panel issued the passport
// it was just shown. Ported from the fork's /api/auth/daemon-verifications.
// SECURITY: fixed regex comparison (auth bypass, CWE-185/CWE-287) with
// constant-time matching; passports are single use (CWE-294); always returns
// a body so the daemon never waits on a 404 (the fork's ban branch returned
// nothing). Rate limited by the default speed limit (NIST AC-7).
router.get(
  "/daemon-verifications",
  permission({ token: false, level: null }),
  async (ctx: Koa.ParameterizedContext) => {
    const jp = systemConfig?.johnnykins?.passport;
    if (!jp || parsePassportMode(jp.mode) !== "johnnykins-legacy" || !checkBanIp(ctx)) {
      ctx.body = { result: false };
      return;
    }
    const type = legacyPassport.parseLegacyPassportType(Number(ctx.headers["johnnykins-passport-type"]));
    const presented: Record<string, unknown> = {};
    for (const f of legacyPassport.legacyFields(type)) {
      const h = ctx.headers[legacyPassport.LEGACY_HEADERS[f as keyof typeof legacyPassport.LEGACY_HEADERS]];
      presented[f] = typeof h === "string" ? h : undefined;
    }
    const result = legacyPassportStore.take(type, presented);
    if (!result) logger.warn(`[Johnnykins] Legacy passport verification failed from ${ctx.ip}`);
    ctx.body = { result };
  }
);

export default router;
