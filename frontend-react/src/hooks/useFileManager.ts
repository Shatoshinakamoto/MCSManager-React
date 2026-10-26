/**
 * Instance file manager state and actions (port of upstream hooks/useFileManager.ts).
 *
 * Upstream keeps ~20 Vue refs that async actions read and write. Here the
 * same state lives on one controller object per mounted file manager, and
 * React re-renders through useSyncExternalStore whenever it changes. That
 * keeps the upstream control flow (await, then read the latest state)
 * without stale React closures.
 *
 * Trust boundary: every path and file name the user types is sent to the
 * panel, which forwards it to the daemon. The daemon is the enforcement point
 * for path traversal (FileManager.checkPath) and permissions; nothing here is
 * a security control.
 *
 * Security:
 * - Download links carry a one-time password issued by the panel. They go to
 *   the daemon's own origin and never include the panel session token
 *   (see apiService isCrossOriginUrl, CWE-201).
 * - The saved tab list in localStorage is validated before use, so a
 *   tampered value cannot inject unexpected types (CWE-20).
 */
import { App } from "antd";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createElement } from "react";
import { t } from "@/lang/i18n";
import {
  addFolder as addFolderApi,
  changePermission as changePermissionApi,
  changePermissionBatch as changePermissionBatchApi,
  compressFile as compressFileApi,
  copyFile as copyFileApi,
  deleteFile as deleteFileApi,
  downloadAddress,
  downloadFromUrl as downloadFromUrlApi,
  downloadFromUrlStop as downloadFromUrlStopApi,
  fileList as getFileListApi,
  getFileStatus as getFileStatusApi,
  moveFile as moveFileApi,
  touchFile as touchFileApi,
  uploadAddress
} from "@/services/apis/fileManager";
import uploadService, { type UploadFiles } from "@/services/uploadService";
import { openLoadingDialog } from "@/components/fc/TaskLoadingDialog";
import OverwriteFilesPopUpContent, { type OverwriteChoice } from "@/components/OverwriteFilesPopUpContent";
import { getRandomId, sleep } from "@/tools/common";
import { convertFileSize } from "@/tools/fileSize";
import { compressFolder, scanDirectory, type ScanItem } from "@/tools/folderUploader";
import { number2permission, permission2number } from "@/tools/permission";
import { mapDaemonAddress, parseForwardAddress, removeTrail, type RemoteMappingEntry } from "@/tools/protocol";
import { reportErrorMsg } from "@/tools/validator";
import type { Breadcrumb, DataType, DownloadFileConfigItem, FileStatus, OperationForm } from "@/types/fileManager";
import { openFileNameDialog, openPermissionDialog, openUnzipDialog, openZipDialog } from "@/widgets/instance/dialogs/FileOperationDialogs";
import { openImageViewerDialog } from "@/widgets/instance/dialogs/ImageViewer";

type Ui = ReturnType<typeof App.useApp>;

/** Daemon address for file transfers, honouring the node's remote address mappings. */
export function getFileConfigAddr(config: { addr: string; remoteMappings?: RemoteMappingEntry[] }) {
  let addr = config.addr;
  if (config.remoteMappings) {
    const mapped = mapDaemonAddress(config.remoteMappings);
    if (mapped) addr = mapped.addr + mapped.prefix;
  }
  return addr;
}

/**
 * Ask the panel for a one-time download link to `frontDir + fileName`.
 * Returns null when the panel gives no address. Throws on API errors.
 */
export async function requestFileLink(instanceId: string, daemonId: string, fileName: string, frontDir: string): Promise<string | null> {
  const cfg = await downloadAddress({ forceRequest: true, params: { file_name: frontDir + fileName, daemonId, uuid: instanceId } });
  if (!cfg) return null;
  const addr = parseForwardAddress(getFileConfigAddr(cfg), "http");
  // The daemon router decodes the segment; encoding keeps "#" or "?" in names intact.
  return `${addr}/download/${encodeURIComponent(cfg.password)}/${encodeURIComponent(fileName)}`;
}

interface TabItem {
  name: string;
  path: string;
  closable: boolean;
  key: string;
  pushedTime: number;
}
type TabsMap = Record<string, TabItem[]>;

const TAB_LIST_KEY = "FileManagerTabMap";
const MAX_FOLDER_SIZE = 250 * 1024 * 1024; // 250MB, limits browser memory while zipping
const MAX_TABS = 10;
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

const isTab = (v: unknown): v is TabItem => {
  const o = v as TabItem;
  return !!o && typeof o.name === "string" && typeof o.path === "string" && typeof o.key === "string" && typeof o.closable === "boolean" && typeof o.pushedTime === "number";
};

/** Read the saved tab map, dropping malformed entries and tabs older than a day. */
function loadTabs(): TabsMap {
  const result: TabsMap = {};
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(TAB_LIST_KEY) || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
    const now = Date.now();
    for (const [key, tabs] of Object.entries(raw as Record<string, unknown>)) {
      if (!Array.isArray(tabs)) continue;
      const kept = tabs.filter(isTab).filter((tab) => !tab.pushedTime || now - tab.pushedTime < ONE_DAY_MS);
      if (kept.length) result[key] = kept;
    }
  } catch {
    // Corrupt value: start fresh.
  }
  return result;
}

function saveTabs(map: TabsMap) {
  try {
    localStorage.setItem(TAB_LIST_KEY, JSON.stringify(map));
  } catch {
    // Storage full or disabled: tabs just will not persist.
  }
}

const errMsg = (err: unknown) => {
  const e = err as { response?: { data?: unknown }; message?: string };
  return String(e?.response?.data ?? e?.message ?? err);
};

type SelectedUploadFile = { file: File; overwrite: boolean };
type UploadConflictDecision = { keep: boolean; action: OverwriteChoice; applyToAll: boolean };

export class FileManagerController {
  ui!: Ui;
  private listeners = new Set<() => void>();
  private version = 0;

  tabList: TabsMap = loadTabs();
  activeTab = "";
  dataSource: DataType[] = [];
  fileStatus?: FileStatus;
  selectedRowKeys: string[] = [];
  selectionData: DataType[] = [];
  operationForm: OperationForm = { name: "", current: 1, pageSize: 100, total: 0 };
  breadcrumbs: Breadcrumb[] = [{ path: "/", name: "/", disabled: false }];
  clipboard?: { type: "copy" | "move"; value: string[] };
  spinning = false;
  currentDisk = t("TXT_CODE_28124988");

  constructor(
    readonly instanceId: string,
    readonly daemonId: string
  ) {
    saveTabs(this.tabList);
  }

  // ---- store plumbing ----
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  /** Publish a state change to React. */
  emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  get ids() {
    return { uuid: this.instanceId, daemonId: this.daemonId };
  }
  get currentTabKey() {
    return this.instanceId + this.daemonId;
  }
  get currentTabs(): TabItem[] {
    return this.tabList[this.currentTabKey] ?? [];
  }
  get currentPath() {
    return removeTrail(this.breadcrumbs[this.breadcrumbs.length - 1].path, "/") + "/";
  }
  get isMultiple() {
    return this.selectionData.length > 1;
  }

  private setTabs(tabs: TabItem[]) {
    if (tabs.length) this.tabList = { ...this.tabList, [this.currentTabKey]: tabs };
    else {
      const next = { ...this.tabList };
      delete next[this.currentTabKey];
      this.tabList = next;
    }
    saveTabs(this.tabList);
    this.emit();
  }

  private updateThisTab(patch: Partial<TabItem>) {
    this.setTabs(this.currentTabs.map((tab) => (tab.key === this.activeTab ? { ...tab, ...patch } : tab)));
  }

  // ---- tabs and paths ----
  initDefaultTab(path = "/") {
    const key = getRandomId();
    this.setTabs([...this.currentTabs, { key, path, name: path, pushedTime: 0, closable: false }]);
    this.activeTab = key;
    this.currentDisk = t("TXT_CODE_28124988");
    return this.handleChangeTab(key);
  }

  handleRemoveTab(key: string) {
    const tabs = this.currentTabs;
    const index = tabs.findIndex((tab) => tab.key === key);
    if (index === -1) return;
    const rest = tabs.filter((tab) => tab.key !== key);
    this.setTabs(rest);
    if (!rest.length) return void this.initDefaultTab();
    if (this.activeTab === key) {
      // Prefer the previous tab; otherwise the last one.
      const nextKey = rest[index > 0 ? index - 1 : rest.length - 1]?.key || "";
      void this.handleChangeTab(nextKey);
    }
  }

  onEditTabs = (targetKey: unknown, action: "add" | "remove") => {
    if (action === "remove") return this.handleRemoveTab(String(targetKey));
    if (this.currentTabs.length >= MAX_TABS) return void this.ui.message.warning(t("TXT_CODE_22042570"));
    const key = getRandomId();
    this.setTabs([...this.currentTabs, { name: "/", path: "/", closable: true, key, pushedTime: Date.now() }]);
    this.currentDisk = t("TXT_CODE_28124988");
    void this.handleChangeTab(key);
  };

  private parsePath(path: string) {
    if (!path) return [];
    const normalized = path.replace(/\\/g, "/");
    const drive = normalized.match(/^([a-zA-Z]):/)?.[1] ?? "";
    const parts = (drive ? normalized.slice(2) : normalized).split("/").filter(Boolean);
    const result = drive ? [drive] : ["/"];
    parts.forEach((_, i) => {
      const p = "/" + parts.slice(0, i + 1).join("/");
      result.push(i < parts.length - 1 ? p + "/" : p);
    });
    return result;
  }

  getLastNameFromPath(path: string) {
    if (path === "/") return "/";
    const parts = (path.endsWith("/") ? path.slice(0, -1) : path).split("/").filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : "/";
  }

  private updateBreadcrumbs(path: string) {
    const paths = this.parsePath(path);
    if (paths.length && paths[0] !== "/") {
      // Windows drive letter
      this.currentDisk = paths[0];
      paths[0] = "/";
      this.breadcrumbs = paths.map((p) => ({ path: `${this.currentDisk}:${p}`, name: this.getLastNameFromPath(p), disabled: false }));
    } else {
      this.currentDisk = t("TXT_CODE_28124988");
      this.breadcrumbs = paths.map((p) => ({ path: p, name: this.getLastNameFromPath(p), disabled: false }));
    }
    if (!this.breadcrumbs.length) this.breadcrumbs = [{ path: "/", name: "/", disabled: false }];
    this.emit();
  }

  handleChangeTab = async (key: string) => {
    const path = this.currentTabs.find((tab) => tab.key === key)?.path || "";
    this.activeTab = key;
    this.updateBreadcrumbs(path);
    this.spinning = true;
    this.operationForm = { ...this.operationForm, name: "", current: 1 };
    this.emit();
    await this.getFileList();
    this.spinning = false;
    this.emit();
  };

  // ---- listing ----
  getFileList = async (throwErr = false, initPath?: string, forceRequest = false) => {
    const thisTab = this.currentTabs.find((e) => e.key === this.activeTab);
    try {
      this.clearSelected();
      let path: string;
      if (initPath) {
        path = initPath;
        this.updateBreadcrumbs(initPath);
      } else {
        path = this.currentPath;
      }
      const res = await getFileListApi({
        forceRequest,
        params: {
          ...this.ids,
          page: this.operationForm.current - 1,
          page_size: this.operationForm.pageSize,
          file_name: this.operationForm.name,
          target: path
        }
      });
      this.dataSource = res?.items || [];
      this.operationForm = { ...this.operationForm, total: res?.total || 0 };
      this.emit();
      if (!thisTab) await this.initDefaultTab(path);
    } catch (error) {
      if (throwErr) throw error;
      reportErrorMsg(errMsg(error));
    }
  };

  reloadList = async () => {
    await this.getFileList(false, undefined, true);
    this.ui.message.success(t("TXT_CODE_8ccb5428"));
  };

  getFileStatus = async (forceRequest = false) => {
    try {
      const res = await getFileStatusApi({ forceRequest, params: this.ids });
      if (res) {
        this.fileStatus = res;
        this.emit();
      }
    } catch (err) {
      reportErrorMsg(errMsg(err));
    }
  };

  // ---- selection ----
  selectChanged = (keys: React.Key[], rows: DataType[]) => {
    this.selectedRowKeys = keys.map(String);
    this.selectionData = rows;
    this.emit();
  };
  oneSelected = (key: string, row: DataType) => {
    if (this.selectedRowKeys.includes(key)) return;
    this.selectedRowKeys = [key];
    this.selectionData = [row];
    this.emit();
  };
  clearSelected() {
    this.selectedRowKeys = [];
    this.selectionData = [];
    this.emit();
  }

  // ---- file operations ----
  touchFile = async (dir?: boolean) => {
    this.clearSelected();
    const name = dir
      ? await openFileNameDialog(t("TXT_CODE_6215388a"), t("TXT_CODE_1b450b79"))
      : await openFileNameDialog(t("TXT_CODE_791c73e9"), t("TXT_CODE_59cb16ff"));
    if (name === undefined) return;
    try {
      const api = dir ? addFolderApi : touchFileApi;
      await api({ params: this.ids, data: { target: this.currentPath + name } });
      await this.getFileList(false, undefined, true);
      this.ui.message.success(t("TXT_CODE_d28c05df"));
    } catch (error) {
      reportErrorMsg(errMsg(error));
    }
  };

  setClipBoard = (type: "copy" | "move", file?: string) => {
    if (file) {
      this.clipboard = { type, value: [this.currentPath + file] };
    } else {
      if (!this.selectionData.length) return reportErrorMsg(t("TXT_CODE_b152cd75"));
      this.clipboard = { type, value: this.selectionData.map((e) => this.currentPath + e.name) };
    }
    this.ui.message.success(t("TXT_CODE_25cb04bb"));
    this.clearSelected();
  };

  paste = async () => {
    const clip = this.clipboard;
    if (!clip?.type || !clip.value) return reportErrorMsg(t("TXT_CODE_b152cd75"));
    const api = clip.type == "copy" ? copyFileApi : moveFileApi;
    try {
      await api({
        params: this.ids,
        data: { targets: clip.value.map((e) => [e, this.currentPath + e.split("/")[e.split("/").length - 1]]) }
      });
      await this.getFileList(false, undefined, true);
      this.ui.message.success(t("TXT_CODE_93d4b66a"));
      this.clearSelected();
      this.clipboard = { ...clip, value: [] };
      this.emit();
    } catch (error) {
      reportErrorMsg(errMsg(error));
    }
  };

  resetName = async (file: string) => {
    const newName = await openFileNameDialog(t("TXT_CODE_c83551f5"), t("TXT_CODE_a5830778"), file);
    if (newName === undefined) return;
    try {
      await moveFileApi({ params: this.ids, data: { targets: [[this.currentPath + file, this.currentPath + newName]] } });
      this.ui.message.success(t("TXT_CODE_5b990e2e"));
      await this.getFileList(false, undefined, true);
    } catch (error) {
      // Upstream swallowed this error; show it instead.
      reportErrorMsg(errMsg(error));
    }
  };

  deleteFile = (file?: string) => {
    const remove = async (files: string[]) => {
      try {
        await deleteFileApi({ params: this.ids, data: { targets: files } });
        await this.getFileList(false, undefined, true);
        this.ui.message.success(t("TXT_CODE_cae10a08"));
        if (this.dataSource.length === 0 && this.operationForm.current > 1) {
          this.operationForm = { ...this.operationForm, current: this.operationForm.current - 1 };
          await this.getFileList(false, undefined, true);
        }
      } catch (error) {
        reportErrorMsg(errMsg(error));
      }
    };
    // Capture the targets now; the selection may change while the dialog is open.
    const targets = this.isMultiple ? this.selectionData.map((e) => this.currentPath + e.name) : [this.currentPath + file];
    this.ui.modal.confirm({
      title: t("TXT_CODE_71155575"),
      content: createElement("div", { style: { color: "red" } }, t("TXT_CODE_6a10302d")),
      okType: "danger",
      okText: t("TXT_CODE_d507abff"),
      onOk: () => remove(targets)
    });
  };

  zipFile = async () => {
    if (!this.selectionData.length) return reportErrorMsg(t("TXT_CODE_b152cd75"));
    const targets = this.selectionData.map((e) => this.currentPath + e.name);
    const filename = await openZipDialog();
    if (filename === undefined) return;
    const loading = openLoadingDialog(t("TXT_CODE_b3825da"), t("TXT_CODE_ba027d6c"), t("TXT_CODE_e1070b52"));
    try {
      await compressFileApi({
        forceRequest: true,
        params: this.ids,
        data: { type: 1, code: "utf-8", source: this.currentPath + filename + ".zip", targets }
      });
      this.ui.message.success(t("TXT_CODE_c3a933d3"));
      await this.getFileList(false, undefined, true);
    } catch (error) {
      this.ui.message.error(t("TXT_CODE_dba9bf61"));
      reportErrorMsg(errMsg(error));
    } finally {
      loading.cancel();
    }
  };

  unzipFile = async (name: string) => {
    const opts = await openUnzipDialog();
    if (!opts) return;
    const loading = openLoadingDialog(t("TXT_CODE_b3825da"), t("TXT_CODE_b82225c3"), t("TXT_CODE_6f038f25"));
    try {
      await compressFileApi({
        forceRequest: true,
        params: this.ids,
        data: {
          type: 2,
          code: opts.code,
          source: this.currentPath + name,
          targets: opts.mode == "0" ? this.currentPath : this.currentPath + opts.dir
        }
      });
      this.ui.message.success(t("TXT_CODE_c3a933d3"));
      await this.getFileList(false, undefined, true);
    } catch (error) {
      this.ui.message.error(t("TXT_CODE_26d7316f"));
      reportErrorMsg(errMsg(error));
    } finally {
      loading.cancel();
    }
  };

  changePermission = async (name: string, mode: number) => {
    const multiple = this.isMultiple;
    const targets = this.selectionData.map((item) => this.currentPath + item.name);
    const result = await openPermissionDialog(number2permission(mode));
    if (!result) return;
    try {
      const chmod = permission2number(result.data.owner, result.data.usergroup, result.data.everyone);
      if (multiple) {
        if (!targets.length) return reportErrorMsg(t("TXT_CODE_b152cd75"));
        const summary = await changePermissionBatchApi({ params: this.ids, data: { chmod, deep: result.deep, targets } });
        if (!summary || summary.failed === 0) this.ui.message.success(t("TXT_CODE_b05948d1"));
        else if (summary.success === 0) this.ui.message.error(t("TXT_CODE_6f8ce7f1", { total: summary.total }));
        else this.ui.message.warning(t("TXT_CODE_31b8fbd5", { success: summary.success, failed: summary.failed }));
      } else {
        await changePermissionApi({ params: this.ids, data: { chmod, deep: result.deep, target: this.currentPath + name } });
        this.ui.message.success(t("TXT_CODE_b05948d1"));
      }
      await this.getFileList(false, undefined, true);
    } catch (err) {
      reportErrorMsg(errMsg(err));
    }
  };

  // ---- navigation ----
  rowClickTable = async (item: string, type: number) => {
    if (type === 1) return;
    const target = this.currentPath + item;
    const before = this.breadcrumbs;
    try {
      this.spinning = true;
      this.breadcrumbs = [...before, { path: target, name: item, disabled: false }];
      this.operationForm = { ...this.operationForm, name: "", current: 1 };
      this.emit();
      await this.getFileList(true);
      this.updateThisTab({ path: target, name: item });
    } catch (error) {
      this.breadcrumbs = before;
      reportErrorMsg(errMsg(error));
    } finally {
      this.spinning = false;
      this.emit();
    }
  };

  handleChangeDir = async (dir: string) => {
    if (!dir) return;
    const oldPath = this.currentPath;
    const oldBreadcrumbs = this.breadcrumbs;
    const oldDisk = this.currentDisk;
    this.spinning = true;
    try {
      this.updateBreadcrumbs(dir);
      this.operationForm = { ...this.operationForm, name: "", current: 1 };
      await this.getFileList(true);
      this.updateThisTab({ path: dir, name: this.getLastNameFromPath(dir) });
    } catch (error) {
      this.breadcrumbs = oldBreadcrumbs;
      this.currentDisk = oldDisk;
      await this.getFileList(false, oldPath).catch(() => undefined);
      reportErrorMsg(`${t("TXT_CODE_96281410")} ${errMsg(error)}`);
    } finally {
      this.spinning = false;
      this.emit();
    }
  };

  handleTableChange = (e: { current: number; pageSize: number }) => {
    this.selectedRowKeys = [];
    this.selectionData = [];
    this.operationForm = { ...this.operationForm, current: e.current, pageSize: e.pageSize };
    this.emit();
    void this.getFileList();
  };

  setSearchName = (name: string) => {
    this.operationForm = { ...this.operationForm, name };
    this.emit();
  };

  handleSearchChange = () => {
    this.operationForm = { ...this.operationForm, current: 1 };
    this.emit();
    void this.getFileList();
  };

  toDisk = async (disk: string) => {
    const diskName = disk === "/" ? disk : disk + ":\\";
    this.currentDisk = disk === "/" ? t("TXT_CODE_28124988") : disk;
    this.breadcrumbs = [{ path: diskName, name: "/", disabled: false }];
    this.spinning = true;
    this.operationForm = { ...this.operationForm, name: "", current: 1 };
    this.updateThisTab({ name: diskName, path: diskName });
    await this.getFileList();
    this.spinning = false;
    this.emit();
  };

  // ---- downloads ----
  getFileLink = async (fileName: string, frontDir?: string) => {
    try {
      return await requestFileLink(this.instanceId, this.daemonId, fileName, frontDir || this.currentPath);
    } catch (err) {
      reportErrorMsg(errMsg(err));
      return null;
    }
  };

  downloadFile = async (fileName: string) => {
    const link = await this.getFileLink(fileName);
    if (!link) return reportErrorMsg(t("TXT_CODE_6d772765"));
    // SECURITY: noopener so the daemon page cannot script this window (CWE-1022).
    window.open(link, "_blank", "noopener");
  };

  downloadFromUrl = async (cfg: DownloadFileConfigItem) => {
    if (!cfg.url) return reportErrorMsg(t("TXT_CODE_f3031262"));
    if (!cfg.fileName) return reportErrorMsg(t("TXT_CODE_7b605ad8"));
    const targetPath = this.currentPath + cfg.fileName;
    if (this.fileStatus?.downloadTasks?.some((task) => task.path === targetPath)) return reportErrorMsg(t("TXT_CODE_2bda9d65"));
    const loading = openLoadingDialog(t("TXT_CODE_b3825da"), t("TXT_CODE_2b5b8a3d"), t("TXT_CODE_6f038f25"));
    try {
      await downloadFromUrlApi({ forceRequest: true, params: this.ids, data: { url: cfg.url, file_name: targetPath } });
      this.ui.message.success(t("TXT_CODE_c3a933d3"));
      await this.getFileList(false, undefined, true);
    } catch (error) {
      this.ui.message.error(t("TXT_CODE_9ea5696b"));
      reportErrorMsg(errMsg(error));
    } finally {
      loading.cancel();
    }
  };

  stopDownloadFileFromUrl = async (taskId: string) => {
    try {
      await downloadFromUrlStopApi({ forceRequest: true, params: this.ids, data: { taskId } });
      await this.getFileList(false, undefined, true);
    } catch (error) {
      reportErrorMsg(errMsg(error));
    }
  };

  isImage(extName: string) {
    return !!extName && ["JPG", "JPEG", "PNG", "GIF", "BMP", "WEBP", "ICO"].includes(extName.toUpperCase());
  }

  showImage = (file: DataType) => {
    void openImageViewerDialog(this.instanceId, this.daemonId, file.name, this.currentPath);
  };

  // ---- uploads ----
  private normalizeTargetPath = (path: string) => removeTrail(path, "/") + "/";

  private async refreshUploadTarget(path: string) {
    if (this.normalizeTargetPath(this.currentPath) !== this.normalizeTargetPath(path)) return;
    await this.getFileList(false, undefined, true);
  }

  private async waitForInstanceFileTasks(baseline: number, timeout = 15000) {
    const start = Date.now();
    let started = false;
    while (Date.now() - start < timeout) {
      await this.getFileStatus(true);
      const count = this.fileStatus?.instanceFileTask ?? 0;
      if (count > baseline) started = true;
      else if (started) return;
      else if (Date.now() - start >= 2000) return;
      await sleep(500);
    }
  }

  private createUploadCompletionTracker(handler: () => void | Promise<void>) {
    let pending = 0;
    let bound = 0;
    let closed = false;
    let finished = false;
    const check = () => {
      if (!closed || pending > 0 || bound === 0 || finished) return;
      finished = true;
      void Promise.resolve(handler()).catch((error) => console.error("Failed to handle upload completion:", error));
    };
    return {
      bind: (task: UploadFiles) => {
        pending += 1;
        bound += 1;
        task.instanceInfo = { instanceId: this.instanceId, daemonId: this.daemonId };
        task.addCallback("end", () => {
          pending -= 1;
          check();
        });
      },
      close: () => {
        closed = true;
        check();
      }
    };
  }

  /** Names among `files` that already exist in `targetPath` (pages through the listing). */
  private async getExistingUploadNames(files: SelectedUploadFile[], targetPath: string) {
    const wanted = new Set(files.map((item) => item.file.name));
    const existing = new Set<string>();
    const pageSize = 100;
    let page = 0;
    let total = 0;
    while (wanted.size > 0) {
      const res = await getFileListApi({
        forceRequest: true,
        params: { ...this.ids, page, page_size: pageSize, file_name: "", target: targetPath }
      });
      const items = res?.items || [];
      total = res?.total || 0;
      for (const item of items) {
        if (!wanted.has(item.name)) continue;
        existing.add(item.name);
        wanted.delete(item.name);
      }
      page += 1;
      if (items.length === 0 || page * pageSize >= total) break;
    }
    return existing;
  }

  private countRemainingConflicts(files: SelectedUploadFile[], start: number, occupied: Set<string>) {
    const simulated = new Set(occupied);
    let count = 0;
    for (let i = start; i < files.length; i++) {
      if (simulated.has(files[i].file.name)) count += 1;
      simulated.add(files[i].file.name);
    }
    return count;
  }

  private confirmUploadConflict(fileName: string, count: number): Promise<UploadConflictDecision> {
    const choice = { action: "skip" as OverwriteChoice, all: false };
    return new Promise((resolve) => {
      this.ui.modal.confirm({
        title: t("TXT_CODE_99ca8563"),
        content: createElement(OverwriteFilesPopUpContent, { count, fileName, onChange: (v: typeof choice) => Object.assign(choice, v) }),
        onOk: () => resolve({ keep: true, action: choice.action, applyToAll: choice.all }),
        onCancel: () => resolve({ keep: false, action: choice.action, applyToAll: choice.all })
      });
    });
  }

  selectedFiles = async (files: File[], overridePath?: string, onComplete?: () => void | Promise<void>) => {
    const targetPath = overridePath || this.currentPath;
    const queue: SelectedUploadFile[] = files.map((file) => ({ file, overwrite: false }));
    const tracker = this.createUploadCompletionTracker(async () => {
      await sleep(300);
      await this.refreshUploadTarget(targetPath);
      if (onComplete) await onComplete();
    });
    try {
      const occupied = await this.getExistingUploadNames(queue, targetPath);
      const confirmed: SelectedUploadFile[] = [];
      let shared: Omit<UploadConflictDecision, "applyToAll"> | undefined;
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        if (occupied.has(item.file.name)) {
          const decision = shared ? { ...shared, applyToAll: true } : await this.confirmUploadConflict(item.file.name, this.countRemainingConflicts(queue, i, occupied));
          if (decision.applyToAll) shared = { keep: decision.keep, action: decision.action };
          if (!decision.keep || decision.action === "skip") continue;
          item.overwrite = decision.action === "overwrite";
        }
        confirmed.push(item);
        occupied.add(item.file.name);
      }
      for (const f of confirmed) {
        const cfg = await uploadAddress({
          forceRequest: true,
          params: { upload_dir: targetPath, daemonId: this.daemonId, uuid: this.instanceId, file_name: f.file.name }
        });
        if (!cfg) throw new Error(t("TXT_CODE_e8ce38c2"));
        const addr = parseForwardAddress(getFileConfigAddr(cfg), "http");
        uploadService.append(f.file, addr, cfg.password, { overwrite: f.overwrite }, (task) => tracker.bind(task));
      }
      tracker.close();
    } catch (err) {
      console.error(err);
      tracker.close();
      reportErrorMsg(errMsg(err));
    }
  };

  /** Zip a dropped or picked folder in the browser, upload it and have the daemon extract it. */
  handleFolderUpload = async (entryOrItems: FileSystemEntry | ScanItem[], manualFolderName?: string) => {
    const isManual = Array.isArray(entryOrItems);
    const folderName = isManual ? manualFolderName : entryOrItems.name;
    if (!folderName) return;

    const startUpload = async () => {
      const targetPath = this.currentPath;
      await this.getFileStatus(true);
      const baseline = this.fileStatus?.instanceFileTask ?? 0;
      const zipKey = `zip_${folderName}`;
      try {
        this.spinning = true;
        this.emit();
        this.ui.message.loading({ content: t("TXT_CODE_b3825da"), key: zipKey });
        const items = isManual ? entryOrItems : await scanDirectory(entryOrItems);
        const totalSize = items.reduce((sum, item) => sum + (item.file?.size || 0), 0);
        // Limit browser memory use while zipping (CWE-400).
        if (totalSize > MAX_FOLDER_SIZE) {
          this.ui.message.destroy(zipKey);
          return void this.ui.message.error(t("TXT_CODE_upload_folder_too_large", { size: convertFileSize(MAX_FOLDER_SIZE.toString()) }));
        }
        this.ui.message.loading({ content: t("TXT_CODE_ba027d6c"), key: zipKey });
        const zipBytes = await compressFolder(items);
        const zipFileName = `upload_tmp_${folderName}_${Date.now()}.zip`;
        const zipFile = new File([zipBytes as BlobPart], zipFileName, { type: "application/zip" });
        const cfg = await uploadAddress({
          forceRequest: true,
          params: { upload_dir: targetPath, daemonId: this.daemonId, uuid: this.instanceId, file_name: zipFileName }
        });
        if (!cfg) throw new Error(t("TXT_CODE_e8ce38c2"));
        const addr = parseForwardAddress(getFileConfigAddr(cfg), "http");
        const tracker = this.createUploadCompletionTracker(async () => {
          await this.waitForInstanceFileTasks(baseline);
          await this.refreshUploadTarget(targetPath);
          this.ui.message.success({ content: t("TXT_CODE_773f36a0"), key: zipKey });
        });
        uploadService.append(zipFile, addr, cfg.password, { overwrite: true, unzip: true, code: "utf-8", deleteAfterUnzip: true }, (task) => tracker.bind(task));
        tracker.close();
        this.ui.message.loading({ content: t("TXT_CODE_b82225c3"), key: zipKey });
      } catch (error) {
        this.ui.message.destroy(zipKey);
        reportErrorMsg(errMsg(error));
      } finally {
        this.spinning = false;
        this.emit();
      }
    };

    try {
      const occupied = await this.getExistingUploadNames([{ file: { name: folderName } as File, overwrite: false }], this.currentPath);
      if (occupied.has(folderName)) {
        this.ui.modal.confirm({
          title: t("TXT_CODE_99ca8563"),
          content: t("TXT_CODE_58a55f17", { name: folderName }),
          onOk: () => void startUpload(),
          okText: t("TXT_CODE_5bf41818"),
          cancelText: t("TXT_CODE_518528d0")
        });
      } else {
        await startUpload();
      }
    } catch (error) {
      reportErrorMsg(errMsg(error));
    }
  };
}

/**
 * Bind a FileManagerController to the calling component. The controller is
 * created once per instance/daemon pair and re-renders the component on change.
 */
export function useFileManager(instanceId = "", daemonId = "") {
  const ui = App.useApp();
  const [ctl, setCtl] = useState(() => new FileManagerController(instanceId, daemonId));
  useEffect(() => {
    if (ctl.instanceId !== instanceId || ctl.daemonId !== daemonId) setCtl(new FileManagerController(instanceId, daemonId));
  }, [ctl, instanceId, daemonId]);
  ctl.ui = ui;
  useSyncExternalStore(ctl.subscribe, ctl.getVersion);
  return ctl;
}
