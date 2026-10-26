/**
 * Chunked file upload queue (port of upstream services/uploadService.ts).
 *
 * Files are uploaded one at a time, each split into 2 MiB pieces sent with up
 * to five requests in flight, straight to the daemon at the address the panel
 * hands out with a one-time upload password. Progress is published through a
 * small zustand store so any component can show it.
 *
 * SECURITY: the daemon URL is absolute, so apiService does not attach the
 * panel session token to these requests (see isCrossOriginUrl). The upload
 * password is only placed in the request path the daemon expects and is never
 * logged.
 */
import { message } from "@/tools/antdStatic";
import { create } from "zustand";
import { t } from "@/lang/i18n";
import { uploadFile as uploadFileApi, uploadFilePiece as uploadFilePieceApi } from "@/services/apis/fileManager";
import { reportErrorMsg } from "@/tools/validator";

const PIECE_SIZE = 1024 * 1024 * 2;
/** Long but finite: one 2 MiB piece on a very slow link (CWE-400: no hung requests forever). */
const PIECE_TIMEOUT_MS = 10 * 60 * 1000;

type UploadOptions = {
  overwrite: boolean;
  unzip?: boolean;
  deleteAfterUnzip?: boolean;
  code?: string;
};

export interface UploadUiData {
  files: number[];
  current?: number[];
  currentFile?: string;
  suspending: boolean;
  instanceInfo?: { daemonId: string; instanceId: string };
  /** Snapshot of in-flight pieces for the small progress squares. */
  pieces: { progress: number; retries: number }[];
}

export const useUploadState = create<UploadUiData>(() => ({ files: [], suspending: false, pieces: [] }));

const errorText = (err: unknown) => {
  const e = err as { response?: { data?: unknown }; message?: string };
  return String(e?.response?.data ?? e?.message ?? err);
};

export class UploadFiles {
  file: File;
  id: string | undefined;
  url: string;
  offset = 0;
  uploadedSize = 0;
  pieceUrl: string | undefined;
  prepared = false;
  canceled = false;
  removing = false;
  instanceInfo: { daemonId: string; instanceId: string } | undefined;
  callbacks = { onStart: new Set<() => void>(), onEnd: new Set<() => void>() };

  constructor(tempId: string, file: File, url: string, password: string, options: UploadOptions) {
    this.file = file;
    this.url = url;
    this.id = tempId;
    void this.init(tempId, url, password, options);
  }

  async init(tempId: string, url: string, password: string, options: UploadOptions) {
    try {
      const cfg = await uploadFileApi({
        forceRequest: true,
        timeout: PIECE_TIMEOUT_MS,
        url: `${url}/upload-new/${password}`,
        params: { filename: this.file.name, size: this.file.size, sum: "", ...options }
      });
      if (!cfg?.id) throw new Error(t("TXT_CODE_62051fcc"));
      this.id = cfg.id;
      this.pieceUrl = `${url}/upload-piece/${cfg.id}`;
      uploadService.changeId(tempId, cfg.id);
      const received = cfg.received ?? [];
      if (received.length > 0 && received[0].start == 0) this.offset = received[0].end;
      this.prepared = true;
      if (this.canceled) await this.stop();
      uploadService.update();
    } catch (err) {
      this.removing = true;
      reportErrorMsg(errorText(err));
    }
  }

  addCallback(type: "start" | "end", callback: () => void) {
    (type === "start" ? this.callbacks.onStart : this.callbacks.onEnd).add(callback);
  }

  removeCallback(type: "start" | "end", callback: () => void) {
    (type === "start" ? this.callbacks.onStart : this.callbacks.onEnd).delete(callback);
  }

  private fire(set: Set<() => void>) {
    set.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error("Error in upload callback:", e);
      }
    });
    set.clear();
  }
  onStart() {
    this.fire(this.callbacks.onStart);
  }
  onEnd() {
    this.fire(this.callbacks.onEnd);
  }

  nextTask(): UploadTask | undefined {
    const rangeStart = this.offset;
    const rangeEnd = Math.min(this.offset + PIECE_SIZE, this.file.size);
    this.offset = rangeEnd;
    if (rangeStart >= this.file.size) return;
    return new UploadTask(this, rangeStart, rangeEnd);
  }

  async stop() {
    if (!this.prepared) {
      this.canceled = true;
      return;
    }
    await uploadFileApi({ forceRequest: true, url: `${this.url}/upload-new/${this.id}`, params: { stop: true } });
    this.onEnd();
    uploadService.files.delete(this.id!);
  }
}

class UploadTask {
  status: "pending" | "uploading" | "completed" | "failed" | "stopping" | "removing" = "pending";
  progress = 0;
  worker?: Promise<unknown>;
  abortController?: AbortController;
  retries = 0;

  constructor(
    readonly file: UploadFiles,
    readonly rangeStart: number,
    readonly rangeEnd: number
  ) {}

  start() {
    const formData = new FormData();
    formData.append("file", this.file.file.slice(this.rangeStart, this.rangeEnd));
    this.abortController = new AbortController();
    this.worker = uploadFilePieceApi({
      forceRequest: true,
      url: this.file.pieceUrl,
      data: formData,
      params: { offset: this.rangeStart },
      timeout: PIECE_TIMEOUT_MS,
      onUploadProgress: (e) => this.onProgress(e.loaded),
      signal: this.abortController.signal
    })
      .then(() => this.onCompleted())
      .catch((e) => this.onError(e));
    this.status = "uploading";
  }

  stop() {
    this.status = "stopping";
    if (this.worker) this.abortController?.abort();
  }

  onError(error: unknown) {
    const isStopping = this.status == "stopping";
    if (!isStopping) {
      this.retries += 1;
      message.error(t("TXT_CODE_6adffa20") + (this.retries < 3 ? t("TXT_CODE_31145b04", { retries: this.retries + 1, maxRetries: 3 }) : t("TXT_CODE_3f828072")));
    }
    const msg = errorText(error);
    console.error("Upload error:", msg);
    if (msg == "Access denied: No task found" || msg == "File is not opened") {
      // Usually another tab finished or cancelled this upload; drop the task.
      this.status = "removing";
      return uploadService.update();
    }
    this.status = "failed";
    this.onProgress(0);
    if (!isStopping && this.retries < 3) this.start();
    else uploadService.update();
  }

  onProgress(progress: number) {
    this.progress = progress;
    uploadService.updateProgress();
  }

  onCompleted() {
    this.status = "completed";
    this.file.uploadedSize += this.rangeEnd - this.rangeStart;
    uploadService.update();
  }
}

class UploadService {
  static concurrency = 5;
  files: Map<string, UploadFiles> = new Map();
  uploaded = 0;
  task: (UploadTask | undefined)[] = [];
  current?: string;
  status: "stopped" | "working" | "suspend" = "stopped";
  private tempSeq = 0;

  append(file: File, url: string, password: string, options: UploadOptions, beforeMounted?: (uploadFile: UploadFiles) => void) {
    // Upstream used Date.now(), which collides when several files are queued in the same millisecond.
    const tempId = `tmp-${Date.now()}-${this.tempSeq++}`;
    const uploadFile = new UploadFiles(tempId, file, url, password, options);
    beforeMounted?.(uploadFile);
    this.files.set(tempId, uploadFile);
    if (this.status == "stopped") {
      this.status = "working";
      this.current = tempId;
      uploadFile.onStart();
    }
    this.update();
    return uploadFile;
  }

  changeId(oldId: string, newId: string) {
    if (this.files.get(newId)) return;
    const file = this.files.get(oldId);
    if (!file) return;
    this.files.set(newId, file);
    this.files.delete(oldId);
    if (this.current == oldId) this.current = newId;
  }

  update() {
    for (let i = 0; i < this.task.length; i++) if (this.task[i]?.status == "completed") this.task[i] = undefined;
    if (this.status == "suspend") {
      if (this.files.size == 0) this.status = "stopped";
      return this.updateProgress();
    }
    let removeFile = false;
    for (const task of this.task) {
      if (!task) continue;
      if (task.status == "removing") removeFile = true;
      if (task.status == "failed") {
        task.status = "pending";
        this.suspend();
      }
    }
    if (this.status == "working" && this.current) {
      const currentFile = this.files.get(this.current);
      if (!currentFile) return this.updateProgress();
      let reachTaskEnd = removeFile;
      if (removeFile) this.task = [];
      for (let i = 0; i < UploadService.concurrency; i++) {
        if (reachTaskEnd || !currentFile.prepared) break;
        if (this.task[i] == undefined) {
          const next = currentFile.nextTask();
          if (!next) {
            reachTaskEnd = true;
            break;
          }
          this.task[i] = next;
        }
      }
      let tasks = 0;
      for (const uploadTask of this.task) {
        if (!uploadTask) continue;
        tasks++;
        if (uploadTask.status != "pending") continue;
        uploadTask.retries = 0;
        uploadTask.start();
      }
      if (reachTaskEnd && currentFile.prepared && tasks == 0) {
        currentFile.onEnd();
        if (!removeFile) this.uploaded += 1;
        this.files.delete(this.current);
        if (removeFile) message.error(t("TXT_CODE_c3adc044") + ": " + currentFile.file.name);
        else message.success(currentFile.file.name + " " + t("TXT_CODE_773f36a0"));
        while (this.files.size > 0) {
          const nextId = this.files.keys().next().value ?? "";
          const nextFile = this.files.get(nextId)!;
          if (nextFile.removing) {
            this.files.delete(nextId);
            continue;
          }
          this.current = nextId;
          nextFile.onStart();
          this.updateProgress();
          this.update();
          return;
        }
        this.current = undefined;
        this.status = "stopped";
      }
    }
    this.updateProgress();
  }

  suspend() {
    if (this.status == "suspend") return;
    this.status = "suspend";
    this.task.forEach((task) => task && task.status != "completed" && task.stop());
    this.updateProgress();
  }

  unsuspend() {
    if (this.status != "suspend") return;
    if (this.files.size > 0) {
      this.status = "working";
      for (const task of this.task) if (task) task.status = "pending";
    }
    this.update();
  }

  async stop() {
    if (this.status == "stopped") return;
    this.status = "stopped";
    for (const task of this.task) if (task && task.status !== "completed") task.stop();
    this.task = [];
    this.current = undefined;
    await Promise.all([...this.files.values()].map((f) => f.stop()));
    this.files.clear();
    this.uploaded = 0;
    this.updateProgress();
  }

  updateProgress() {
    const pieces = this.task.filter((v): v is UploadTask => !!v).map((v) => ({ progress: v.progress / (v.rangeEnd - v.rangeStart), retries: v.retries }));
    const currentFile = this.current ? this.files.get(this.current) : undefined;
    if (!currentFile) {
      useUploadState.setState({ files: [this.uploaded, this.uploaded + this.files.size], suspending: this.status == "suspend", current: undefined, currentFile: undefined, instanceInfo: undefined, pieces }, true);
      return;
    }
    useUploadState.setState(
      {
        current: [currentFile.uploadedSize, currentFile.file.size],
        currentFile: currentFile.file.name,
        files: [this.uploaded + 1, this.uploaded + this.files.size],
        suspending: this.status == "suspend",
        instanceInfo: currentFile.instanceInfo,
        pieces
      },
      true
    );
  }

  /** Queue position of a file (0 = uploading now), or -1 when it is not queued. */
  getFileNth(id: string): number {
    return Array.from(this.files.keys()).indexOf(id);
  }
}

const uploadService = new UploadService();
export default uploadService;
