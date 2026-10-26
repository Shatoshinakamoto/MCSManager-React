import crypto from "crypto";
import Koa from "koa";
import { GlobalVariable } from "mcsmanager-common";
import { ROLE } from "../entity/user";
import { effectiveLevel } from "../service/web_admin";
import { $t } from "../i18n";
import { getUuidByApiKey, ILLEGAL_ACCESS_KEY, isAjax, logout } from "../service/passport_service";
import userSystem from "../service/user_service";
import { systemConfig } from "../setting";
import { isUnsafeIntegrationTestRequest } from "../utils/integration_test_mode";
import { checkSafeName } from "../utils/safe";

/**
 * @description Request speed limit, 8 requests per second
 */
function requestSpeedLimit(ctx: Koa.ParameterizedContext) {
  const SESSION_REQ_TIMES = "SESSION_REQ_TIMES";
  const MAX_REQUESTS_PER_SECOND = 8;
  const WINDOW_SIZE = 1000;
  const currentTime = new Date().getTime();
  if (!ctx.session) return false;
  let requestTimes: number[] = ctx.session[SESSION_REQ_TIMES] || [];
  requestTimes = requestTimes.filter((time) => currentTime - time < WINDOW_SIZE);
  if (requestTimes.length >= MAX_REQUESTS_PER_SECOND) {
    return false;
  }
  requestTimes.push(currentTime);
  ctx.session[SESSION_REQ_TIMES] = requestTimes;
  return true;
}

// Failed callback
export function verificationFailed(ctx: Koa.ParameterizedContext) {
  ctx.status = 403;
  ctx.body = `${$t("TXT_CODE_permission.forbidden")}`;
}

function tokenError(ctx: Koa.ParameterizedContext) {
  ctx.status = 403;
  ctx.body = `${$t("TXT_CODE_permission.forbiddenTokenError")}`;
}

function ajaxError(ctx: Koa.ParameterizedContext) {
  ctx.status = 403;
  ctx.body = `${$t("TXT_CODE_permission.xmlhttprequestError")}`;
}

function apiError(ctx: Koa.ParameterizedContext) {
  ctx.status = 403;
  ctx.body = `${$t("TXT_CODE_permission.apiError")}`;
}

function disabledApiKey(ctx: Koa.ParameterizedContext) {
  ctx.status = 403;
  ctx.body = $t("TXT_CODE_db253979");
}

function tooFast(ctx: Koa.ParameterizedContext) {
  ctx.status = 500;
  ctx.body = `${$t("TXT_CODE_permission.tooFast")}`;
}

interface IPermissionCfg {
  token?: boolean;
  level?: number | null;
  speedLimit?: boolean;
}

// Basic user permission middleware
export default (parameter: IPermissionCfg) => {
  return async (ctx: Koa.ParameterizedContext, next: Function) => {
    // Web Admin routes fall back to Admin until enforcement is on (service/web_admin.ts).
    const level = parameter.level == null ? parameter.level : effectiveLevel(Number(parameter.level));
    // Unsafe integration-test mode bypass: when the panel is started with
    // `--Unsafe-Integration-Test-Mode=<key>` (parameter name case-insensitive)
    // and the request carries an `x-request-api-key` header equal to `<key>`,
    // skip every permission check below and go straight to the route handler.
    // See utils/integration_test_mode.ts for the security warning.
    if (isUnsafeIntegrationTestRequest(ctx.request?.header["x-request-api-key"])) {
      return await next();
    }

    if (
      (parameter.speedLimit == null || parameter.speedLimit === true) &&
      Number(parameter.level) < 10
    ) {
      // Request speed check
      if (!requestSpeedLimit(ctx)) {
        return tooFast(ctx);
      }
    }

    // If it is an API request, perform API-level permission judgment
    const key = ctx.request?.header["x-request-api-key"] || ctx.query.apikey;
    if (key) {
      const enableApiKey = systemConfig?.enableApiKey || false;
      if (!enableApiKey) return disabledApiKey(ctx);

      // Validate apiKey: only A-Z, a-z, 0-9 are allowed
      const apiKey = String(key);
      if (!checkSafeName(apiKey)) {
        return apiError(ctx);
      }

      const user = getUuidByApiKey(apiKey);
      if (user && enableApiKey === "ONLY_ADMIN" && user.permission < ROLE.ADMIN)
        return disabledApiKey(ctx);
      if (user && user.permission >= Number(level)) {
        return await next();
      } else {
        return apiError(ctx);
      }
    }

    // If the route requires Token verification, it will be verified, the default is automatic verification
    if (parameter.token !== false) {
      if (!isAjax(ctx)) return ajaxError(ctx);
      // SECURITY: the React UI sends the anti-CSRF token in the X-MCSM-Token
      // header so it stays out of URLs, proxy logs and Referer (CWE-598).
      // The ?token= query parameter is still accepted for older clients.
      const realToken = ctx.session?.["token"];
      if (!sessionTokenMatches(readRequestToken(ctx), realToken)) {
        return tokenError(ctx);
      }
    }

    // If the permission attribute is a number, the permission determination is automatically executed
    if (!isNaN(parseInt(String(parameter.level)))) {
      // The most basic authentication decision
      if (ctx.session?.["login"] === true && ctx.session["uuid"] && ctx.session["userName"]) {
        const user = userSystem.getInstance(ctx.session["uuid"]);

        // ban check
        if (user && user.permission < 0) {
          return logout(ctx);
        }

        // Judgment of permissions for ordinary users and administrative users
        if (user && user.permission >= Number(level)) {
          return await next();
        }
      }
      // END: to verificationFailed()
    } else {
      return await next();
    }

    // record the number of unauthorized access
    GlobalVariable.set(ILLEGAL_ACCESS_KEY, GlobalVariable.get(ILLEGAL_ACCESS_KEY, 0) + 1);
    return verificationFailed(ctx);
  };
};

/** Session anti-CSRF token from the X-MCSM-Token header, else from ?token=. */
export function readRequestToken(ctx: Koa.ParameterizedContext): string | undefined {
  const header = ctx.get("x-mcsm-token");
  if (header) return header;
  const q = ctx.query.token;
  return typeof q === "string" ? q : undefined;
}

/**
 * Constant-time comparison of the request token with the session token
 * (CWE-208). Missing tokens never match, so a session without a token
 * cannot be satisfied by sending no token either.
 */
export function sessionTokenMatches(requestToken: unknown, realToken: unknown): boolean {
  if (typeof requestToken !== "string" || typeof realToken !== "string" || !realToken) return false;
  const a = Buffer.from(requestToken);
  const b = Buffer.from(realToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
