/**
 * Java Manager routes. Every call carries the instance it is made for
 * (`instanceId`, authorized by the panel): for an instance linked to an OS
 * account, the list shows the shared runtimes plus that account's own,
 * downloads go to that account's folder and belong to it, and only runtimes
 * the account may use can be selected. Unlinked instances behave as before.
 * See service/java_manager.ts and docs/features/os-user-accounts.md.
 *
 * SECURITY: runtime names are limited to safe folder names (CWE-22); the
 * scope always comes from the instance's stored binding, never from the
 * request (CWE-639).
 */
import fs from "fs-extra";
import path from "path";
import { extract } from "tar";
import { URL } from "url";
import { commandStringToArray } from "../entity/commands/base/command_parser";
import { JavaInfo } from "../entity/commands/java/java_manager";
import type Instance from "../entity/instance/instance";
import { $t } from "../i18n";
import downloadManager from "../service/download_manager";
import javaManager, { JAVA_FULLNAME_PATTERN, type JavaRuntimeEntry } from "../service/java_manager";
import logger from "../service/log";
import * as protocol from "../service/protocol";
import { routerApp } from "../service/router_app";
import FileManager from "../service/system_file";
import instanceManager from "../service/system_instance";
import { handOverTree } from "../tools/owner_tree";
import { grantFolder } from "../tools/windows_acl";

/** The instance named by the request, if any (unknown ids are an error). */
function requestInstance(data: any): Instance | undefined {
  if (data?.instanceId == null || data.instanceId === "") return undefined;
  const instance = instanceManager.getInstance(String(data.instanceId));
  if (!instance) throw new Error($t("TXT_CODE_ef6b54fb"));
  return instance;
}

/** Unpacks a downloaded Zulu archive into `javaPath` (the archive's top folder is dropped). */
async function extractJavaArchive(javaPath: string, fileName: string, filePath: string) {
  if (fileName.endsWith(".zip")) {
    const fileManager = new FileManager(javaPath, "UTF-8");
    await fileManager.unzip(fileName, ".", "UTF-8");

    const extractDir = path.join(javaPath, path.basename(fileName, ".zip"));
    const extractDirInfo = await fs.stat(extractDir);
    if (fs.existsSync(extractDir) && extractDirInfo.isDirectory()) {
      const files = await fs.readdir(extractDir);
      for (const file of files) {
        await fs.move(path.join(extractDir, file), path.join(javaPath, file));
      }
      await fs.remove(extractDir);
    }
  } else if (fileName.endsWith(".tar.gz")) {
    await extract({
      file: filePath,
      cwd: javaPath,
      strip: 1
    });
  }
}

routerApp.on("java_manager/list", async (ctx, data) => {
  try {
    const instance = requestInstance(data);
    const { scope } = await javaManager.scopeOf(instance);
    protocol.response(ctx, javaManager.list(instance ? scope : undefined));
  } catch (error: any) {
    protocol.responseError(ctx, error);
  }
});

routerApp.on("java_manager/add", async (ctx, data) => {
  const info = new JavaInfo(data.name, Date.now());

  try {
    if (!FileManager.checkFileName(data.name)) throw new Error($t("TXT_CODE_b623b66f"));

    if (javaManager.exists(info.fullname)) throw new Error($t("TXT_CODE_79cf0302"));
    info.path = path.normalize(data.path);
    javaManager.addJava(info);
    protocol.response(ctx, true);
  } catch (error: any) {
    protocol.responseError(ctx, error);
  }
});

routerApp.on("java_manager/download", async (ctx, data) => {
  const info = new JavaInfo(data.name, Date.now(), data.version);
  let instance: Instance | undefined;
  let identity;
  let scope: string | null = null;
  try {
    if (!JAVA_FULLNAME_PATTERN.test(info.fullname)) throw new Error($t("TXT_CODE_b623b66f"));
    instance = requestInstance(data);
    ({ identity, scope } = await javaManager.scopeOf(instance));
  } catch (error: any) {
    return protocol.responseError(ctx, error);
  }
  if (javaManager.exists(scope ? `${info.fullname}@${scope}` : info.fullname)) {
    return protocol.responseError(ctx, new Error($t("TXT_CODE_79cf0302")));
  }
  protocol.response(ctx, true);

  info.downloading = true;
  if (scope && identity) {
    // Per-account runtime: download and unpack where only the daemon can write,
    // hand it to the account, then move it into place.
    let entry: JavaRuntimeEntry | undefined;
    let staged: string | undefined;
    try {
      entry = await javaManager.beginScopedDownload(info, scope);
      const downloadUrl = await javaManager.getJavaDownloadUrl(info);
      if (!downloadUrl) throw new Error($t("TXT_CODE_4b0f31b4"));
      logger.info(`Download Java: ${downloadUrl} --> ${entry.id}`);
      staged = await javaManager.newStagingFolder();
      const fileName = path.basename(new URL(downloadUrl).pathname);
      const filePath = path.join(staged, fileName);
      await downloadManager.downloadFromUrl(downloadUrl, filePath);
      await extractJavaArchive(staged, fileName, filePath);
      await fs.remove(filePath);
      if (identity.kind === "posix") {
        const tree = await handOverTree(staged, identity, { mode: "handOver", closeTop: true });
        if (tree.failed) throw new Error(`Could not hand the runtime to the OS account (${tree.failed} entries failed).`);
      }
      await javaManager.finishScopedDownload(entry, staged);
      staged = undefined;
      if (identity.kind === "windows") await grantFolder(entry.path, identity.sid, "RX");
      logger.info(`Install Env Success: ${entry.id}`);
    } catch (error: any) {
      logger.warn(`Install Env Error: ${error.message}`);
      if (staged) await fs.remove(staged).catch(() => undefined);
      if (entry) await javaManager.removeJava(entry.id).catch(() => undefined);
    }
    return;
  }

  try {
    javaManager.addJava(info);

    const downloadUrl = await javaManager.getJavaDownloadUrl(info);
    if (!downloadUrl) throw new Error($t("TXT_CODE_4b0f31b4"));

    logger.info(`Download Java: ${downloadUrl} --> ${info.fullname}`);
    const javaPath = path.join(javaManager.getJavaDataDir(), info.fullname);
    fs.mkdirsSync(javaPath);

    const fileName = path.basename(new URL(downloadUrl).pathname);
    const filePath = path.join(javaPath, fileName);

    await downloadManager.downloadFromUrl(downloadUrl, filePath);
    const java = javaManager.getJava(info.fullname);
    if (!java) return;

    await extractJavaArchive(javaPath, fileName, filePath);

    logger.info(`Install Env Success: ${info.fullname}`);
    info.downloading = false;
    javaManager.updateJavaInfo(info);
  } catch (error: any) {
    logger.warn(`Install Env Error: ${error.message}`);
    await javaManager.removeJava(info.fullname);
    protocol.responseError(ctx, error);
  }
});

routerApp.on("java_manager/using", async (ctx, data) => {
  try {
    const instance = instanceManager.getInstance(data.instanceId);
    if (!instance) throw new Error($t("TXT_CODE_ef6b54fb"));
    // Only a shared runtime or one of this instance's own account can be chosen.
    const { scope } = await javaManager.scopeOf(instance);
    const java = javaManager.resolveForScope(String(data.id ?? ""), scope);

    const startCommandList = commandStringToArray(instance.config.startCommand);
    startCommandList[0] = "{mcsm_java}";
    instance.parameters({
      java: {
        id: java.id
      },
      startCommand: startCommandList.join(" ")
    });

    protocol.response(ctx, true);
  } catch (error: any) {
    protocol.responseError(ctx, error);
  }
});

routerApp.on("java_manager/delete", async (ctx, data) => {
  try {
    const instance = requestInstance(data);
    let id = String(data.id ?? "");
    if (instance) id = javaManager.resolveForScope(id, (await javaManager.scopeOf(instance)).scope).id;
    await javaManager.removeJava(id);
    protocol.response(ctx, true);
  } catch (error: any) {
    protocol.responseError(ctx, error);
  }
});
