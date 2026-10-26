/**
 * Java Manager API. Every call names the instance it is made for
 * (`instanceId`, checked against the caller's assignments below) and the
 * panel passes it on, so a daemon can scope runtimes to the instance's
 * linked OS account (daemon: routers/java_manager_router.ts,
 * docs/features/os-user-accounts.md).
 */
import Router from "@koa/router";
import { ROLE } from "../entity/user";
import permission from "../middleware/permission";
import RemoteRequest from "../service/remote_command";
import RemoteServiceSubsystem from "../service/remote_service";

const router = new Router({ prefix: "/java_manager" });

import { $t } from "../i18n";
import { speedLimit } from "../middleware/limit";
import validator from "../middleware/validator";
import { getUserUuid } from "../service/passport_service";
import { isHaveInstanceByUuid } from "../service/permission_service";

router.use(async (ctx, next) => {
  const daemonId = String(ctx.query.daemonId);
  const instanceId = String(ctx.query.instanceId);
  const userUuid = getUserUuid(ctx);
  if (isHaveInstanceByUuid(userUuid, daemonId, instanceId)) {
    await next();
  } else {
    ctx.status = 403;
    ctx.body = $t("TXT_CODE_eb401a37");
  }
});

router.get(
  "/list",
  permission({ level: ROLE.USER }),
  validator({ query: { daemonId: String, instanceId: String } }),
  async (ctx) => {
    const daemonId = String(ctx.query.daemonId);
    const remoteService = RemoteServiceSubsystem.getInstance(daemonId);
    // The instance decides which runtimes are listed (shared + its OS account's own).
    const response = await new RemoteRequest(remoteService).request("java_manager/list", {
      instanceId: String(ctx.query.instanceId)
    });
    ctx.body = response;
  }
);

router.post(
  "/add",
  speedLimit(3),
  permission({ level: ROLE.ADMIN }),
  validator({
    query: {
      daemonId: String
    },
    body: {
      name: String,
      path: String
    }
  }),
  async (ctx) => {
    const daemonId = String(ctx.query.daemonId);
    const remoteService = RemoteServiceSubsystem.getInstance(daemonId);
    const response = await new RemoteRequest(remoteService).request("java_manager/add", {
      name: ctx.request.body.name,
      path: ctx.request.body.path
    });
    ctx.body = response;
  }
);

router.post(
  "/download",
  speedLimit(3),
  permission({ level: ROLE.ADMIN }),
  validator({
    query: {
      daemonId: String,
      instanceId: String
    },
    body: {
      name: String,
      version: String
    }
  }),
  async (ctx) => {
    const daemonId = String(ctx.query.daemonId);
    const remoteService = RemoteServiceSubsystem.getInstance(daemonId);
    // Downloads for an instance linked to an OS account go to (and belong to) that account.
    const response = await new RemoteRequest(remoteService).request("java_manager/download", {
      name: ctx.request.body.name,
      version: ctx.request.body.version,
      instanceId: String(ctx.query.instanceId)
    });
    ctx.body = response;
  }
);

router.post(
  "/using",
  permission({ level: ROLE.USER }),
  validator({
    query: {
      daemonId: String,
      instanceId: String
    },
    body: {
      id: String
    }
  }),
  async (ctx) => {
    const daemonId = String(ctx.query.daemonId);
    const remoteService = RemoteServiceSubsystem.getInstance(daemonId);

    const response = await new RemoteRequest(remoteService).request("java_manager/using", {
      instanceId: ctx.query.instanceId,
      id: ctx.request.body.id
    });
    ctx.body = response;
  }
);

router.delete(
  "/delete",
  permission({ level: ROLE.ADMIN }),
  validator({
    query: {
      daemonId: String,
      instanceId: String
    },
    body: {
      id: String
    }
  }),
  async (ctx) => {
    const daemonId = String(ctx.query.daemonId);
    const remoteService = RemoteServiceSubsystem.getInstance(daemonId);

    const response = await new RemoteRequest(remoteService).request("java_manager/delete", {
      id: ctx.request.body.id,
      instanceId: String(ctx.query.instanceId)
    });
    ctx.body = response;
  }
);

export default router;
