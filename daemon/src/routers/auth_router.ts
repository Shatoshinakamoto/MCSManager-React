/**
 * Daemon socket authentication: upstream daemon-key check plus the Johnnykins
 * passport handshake and ban list (service/johnnykins/*).
 *
 * SECURITY: every non-auth event requires a logged-in session (NIST AC-3).
 * Failed logins count toward the ban list (NIST AC-7, CWE-307). Nothing
 * secret is logged (CWE-532).
 */
import { IGNORE } from "../const";
import { globalConfiguration } from "../entity/config";
import RouterContext from "../entity/ctx";
import { $t } from "../i18n";
import logger from "../service/log";
import { LOGIN_BY_TOP_LEVEL, loginSuccessful } from "../service/mission_passport";
import * as protocol from "../service/protocol";
import { routerApp } from "../service/router_app";
import { banList } from "../service/johnnykins/ban_list";
import { issueChallenge, verifyAuth } from "../service/johnnykins/passport_auth";

// latest verification time
const AUTH_TIMEOUT = 6000;

function checkLogin(ctx: RouterContext) {
  return (
    ctx.session.key === globalConfiguration.config.key &&
    ctx.session.type === LOGIN_BY_TOP_LEVEL &&
    ctx.session.login &&
    ctx.session.id
  );
}

// Top-level authority authentication middleware (this is the first place for any authority authentication middleware)
routerApp.use(async (routePath, ctx, _, next) => {
  const socket = ctx.socket;

  // release all data flow controllers
  if (routePath.startsWith("stream")) return next();

  // Except for the auth controllers, which are publicly accessible, other business controllers must be authorized before they can be accessed
  if (routePath === "auth" || routePath === "auth/challenge") return await next();
  if (!ctx.session) throw new Error("Session does not exist in authentication middleware.");
  if (checkLogin(ctx)) return await next();

  logger.warn(
    $t("TXT_CODE_auth_router.notAccess", {
      id: socket.id,
      address: socket.handshake.address,
      event: routePath
    })
  );
  return protocol.error(ctx, "error", IGNORE, {
    disablePrint: true
  });
});

function panelIpAllowed(ctx: RouterContext) {
  let ip = ctx.socket.handshake.address;
  // extract IPv4 address from IPv6 format
  if (ip.startsWith("::ffff:")) ip = ip.substring(7);
  return !globalConfiguration.config.whiteListPanelIp || globalConfiguration.config.whiteListPanelIps.includes(ip);
}

// Passport step 1: hand out a single-use nonce.
routerApp.on("auth/challenge", (ctx) => {
  const ip = banList.clientAddress(ctx);
  if (banList.isBanned(ip) || !panelIpAllowed(ctx)) {
    protocol.msg(ctx, "auth/challenge", null);
    return ctx.socket.disconnect();
  }
  protocol.msg(ctx, "auth/challenge", issueChallenge(ctx));
});

// authentication controller
routerApp.on("auth", async (ctx, data) => {
  const ip = banList.clientAddress(ctx);
  try {
    if (banList.isBanned(ip)) {
      protocol.msg(ctx, "auth", { result: false, reason: "banned" });
      return ctx.socket.disconnect();
    }
    if (!panelIpAllowed(ctx)) {
      protocol.msg(ctx, "auth", { result: false, reason: "ip_not_allowed" });
      return ctx.socket.disconnect();
    }
    const res = await verifyAuth(ctx, data);
    if (res.result) {
      banList.success(ip);
      // The authentication is passed, and the registered session is a trusted session
      logger.info(
        $t("TXT_CODE_auth_router.access", {
          id: ctx.socket.id,
          address: ctx.socket.handshake.address
        })
      );
      // Log the authentication success
      loginSuccessful(ctx, globalConfiguration.config.key);
      // Upstream panels expect a bare `true` for a bare-key login.
      return protocol.msg(ctx, "auth", typeof data === "string" ? true : res);
    }
    logger.warn(`[Johnnykins] Daemon login refused for ${ip}: ${res.reason}`);
    // Mode/pairing mismatches are configuration problems, not guessing; don't ban for them.
    if (res.reason === "bad_key" || res.reason === "bad_proof" || res.reason === "legacy_verify_failed") banList.fail(ip);
    protocol.msg(ctx, "auth", typeof data === "string" ? false : res);
  } catch (e) {
    logger.warn(`[Johnnykins] Daemon login error for ${ip}: ${(e as Error).message}`);
    protocol.msg(ctx, "auth", typeof data === "string" ? false : { result: false, reason: "bad_request" });
  }
});

// Connected event for timeout authentication close
routerApp.on("connection", (ctx) => {
  const session = ctx.session;
  setTimeout(() => {
    if (!session.login) {
      ctx.socket.disconnect();
      logger.info(
        $t("TXT_CODE_auth_router.disconnect", {
          id: ctx.socket.id,
          address: ctx.socket.handshake.address
        })
      );
    }
  }, AUTH_TIMEOUT);
});
