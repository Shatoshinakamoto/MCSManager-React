/**
 * Live console session for one instance (port of upstream hooks/useTerminal.ts).
 *
 * The browser connects straight to the daemon with socket.io, authenticated
 * by a one-time stream password that the panel issues
 * (POST /api/protected_instance/stream_channel). Commands typed in the input
 * box go out as "stream/input" (sanitized on the daemon by the Johnnykins
 * command guard); raw keystrokes go out as "stream/write" and are only sent
 * when the instance runs with a PTY, as upstream does.
 *
 * Kept as a plain class so the React hook can create and dispose it per mount
 * (StrictMode mounts effects twice in development).
 */
import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import EventEmitter from "eventemitter3";
import type { Socket } from "socket.io-client";
import { GLOBAL_INSTANCE_NAME } from "@/config/const";
import { t } from "@/lang/i18n";
import { setUpTerminalStreamChannel } from "@/services/apis/instance";
import { toCopy } from "@/tools/copy";
import { mapDaemonAddress, parseForwardAddress } from "@/tools/protocol";
import { INSTANCE_STATUS_CODE, type InstanceDetail } from "@/types/instance";
import { setHistory } from "./commandHistory";
import { encodeConsoleColor } from "./consoleColor";
import { createTerminalHistoryReplayGate } from "./historyReplayGate";
import { makeSocketIo } from "./socket";
import { attachTerminalTouchControls } from "./touchControls";

export interface StdoutData {
  instanceUuid: string;
  text: string;
}

export interface TerminalSnapshot {
  state?: InstanceDetail;
  isConnect: boolean;
  isReady: boolean;
  socketAddress: string;
}

export class TerminalSession {
  readonly events = new EventEmitter();
  private socket?: Socket;
  private term?: Terminal;
  private snapshot: TerminalSnapshot = { isConnect: false, isReady: false, socketAddress: "" };
  private readonly changeListeners = new Set<() => void>();
  private readonly replayGate = createTerminalHistoryReplayGate();
  private manualDisconnect = false;
  private disposed = false;
  private fitTask?: ReturnType<typeof setInterval>;
  private statusTask?: ReturnType<typeof setInterval>;
  private removeTouchHandlers?: () => void;

  constructor(private readonly transparentBackground: boolean) {
    this.events.on("stdout", (v: StdoutData) => {
      const text = String(v?.text ?? "");
      this.term?.write(this.snapshot.state?.config?.terminalOption?.haveColor ? encodeConsoleColor(text) : text);
    });
    this.statusTask = setInterval(() => {
      if (this.socket?.connected) this.socket.emit("stream/detail", {});
    }, 1000);
  }

  // ---- React subscription ----
  subscribe = (fn: () => void) => {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;
  private patch(p: Partial<TerminalSnapshot>) {
    this.snapshot = { ...this.snapshot, ...p };
    this.changeListeners.forEach((fn) => fn());
  }

  get state() {
    return this.snapshot.state;
  }
  get isStopped() {
    return this.snapshot.state?.status === INSTANCE_STATUS_CODE.STOPPED;
  }
  get isGlobalTerminal() {
    return this.snapshot.state?.config.nickname === GLOBAL_INSTANCE_NAME;
  }

  /** Ask the panel for stream credentials and connect to the daemon. */
  async connect(daemonId: string, instanceId: string): Promise<void> {
    if (this.socket || this.disposed) return;
    this.manualDisconnect = false;
    this.patch({ isReady: false });

    const remoteInfo = await setUpTerminalStreamChannel({ params: { daemonId, uuid: instanceId } });
    if (!remoteInfo) throw new Error(t("TXT_CODE_181f2f08"));
    if (this.disposed) return;

    let { addr, prefix } = remoteInfo;
    if (remoteInfo.remoteMappings) {
      const mapped = mapDaemonAddress(remoteInfo.remoteMappings);
      if (mapped) ({ addr, prefix } = mapped);
    }
    this.patch({ socketAddress: parseForwardAddress(addr, "ws") });
    // SECURITY: the stream password is single-purpose and short-lived; it is
    // kept only in this closure and never logged or stored.
    const password = remoteInfo.password;
    const socket = makeSocketIo(addr, prefix);
    this.socket = socket;

    socket.on("connect", () => {
      socket.emit("stream/auth", { data: { password } });
      this.patch({ isConnect: true });
    });
    socket.on("connect_error", (error) => {
      console.error("[Socket.io] Connect error: ", addr, error.message);
      this.patch({ isConnect: false });
      this.events.emit("error", error);
    });
    socket.on("instance/stopped", () => this.events.emit("stopped"));
    socket.on("instance/opened", () => this.events.emit("opened"));
    socket.on("stream/auth", (packet) => {
      if (packet?.data === true) {
        socket.emit("stream/detail", {});
        this.events.emit("connect");
        this.patch({ isReady: true });
      } else {
        this.events.emit("error", new Error("Stream/auth error!"));
      }
    });
    socket.io.on("reconnect", () => {
      this.patch({ isConnect: true });
      socket.emit("stream/auth", { data: { password } });
    });
    socket.on("disconnect", () => {
      if (!this.manualDisconnect) console.warn("[Socket.io] disconnect:", addr);
      this.patch({ isConnect: false });
      this.events.emit("disconnect");
    });
    socket.on("instance/stdout", (packet) => this.events.emit("stdout", packet?.data));
    socket.on("stream/detail", (packet) => {
      const v = packet?.data as InstanceDetail | undefined;
      this.patch({ state: v });
      this.events.emit("detail", v);
    });
    socket.connect();
  }

  private refreshWindowSize(w: number, h: number) {
    this.socket?.emit("stream/resize", { data: { w, h } });
  }

  /** Create the xterm window inside `element`. */
  initTerminalWindow(element: HTMLElement): Terminal | undefined {
    // A session disposed by a StrictMode re-mount must not leave a window behind.
    if (this.disposed) return undefined;
    if (this.term) throw new Error("Terminal already initialized, Please refresh the page!");
    const isTouchCapable = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    const term = new Terminal({
      convertEol: true,
      disableStdin: false,
      cursorStyle: "underline",
      cursorBlink: true,
      fontSize: 14,
      theme: { background: this.transparentBackground ? "#00000000" : "#1e1e1e", selectionBackground: "rgba(255, 255, 255, 0.3)" },
      allowProposedApi: true,
      allowTransparency: true
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";
    this.term = term;

    if (document.createElement("canvas").getContext("webgl2")) {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } else {
      term.loadAddon(new CanvasAddon());
    }

    term.open(element);
    if (isTouchCapable) {
      this.removeTouchHandlers = attachTerminalTouchControls({
        element,
        terminal: term,
        canPaste: () => this.state?.config.terminalOption?.pty === true && this.state?.status !== INSTANCE_STATUS_CODE.STOPPED
      });
    }

    // Ctrl+C copies when text is selected; otherwise it goes to the program.
    term.attachCustomKeyEventHandler((arg) => {
      if (arg.type === "keydown" && arg.ctrlKey && arg.code === "KeyC") {
        const selection = term.getSelection();
        if (selection) {
          arg.preventDefault();
          void toCopy(selection);
          term.clearSelection();
          return false;
        }
      }
      return true;
    });

    fitAddon.fit();
    this.refreshWindowSize(term.cols - 1, term.rows - 1);
    this.fitTask = setInterval(() => {
      fitAddon.fit();
      this.refreshWindowSize(term.cols - 1, term.rows - 1);
    }, 2000);

    let lastCtrlCTime = 0;
    const sendInput = (data: string) => this.socket?.emit("stream/write", { data: { input: data } });
    term.onData((data) => {
      // Ignore xterm's own replies to escape sequences in the replayed backlog.
      if (this.replayGate.isReplaying()) return;
      // Raw keystrokes only reach the daemon for running PTY instances.
      if (this.state?.config.terminalOption?.pty === false || this.state?.status === INSTANCE_STATUS_CODE.STOPPED) return;
      if (data !== "\x03") {
        lastCtrlCTime = 0;
        return sendInput(data);
      }
      // Ctrl+C needs a double press within 500 ms (upstream behaviour).
      const now = Date.now();
      if (now - lastCtrlCTime < 500) {
        term.write("\r\n" + t("TXT_CODE_3725b37b") + "\r\n");
        sendInput(data);
        lastCtrlCTime = 0;
      } else {
        lastCtrlCTime = now;
        term.write("\r\n" + t("TXT_CODE_3fd222b0"));
      }
    });
    return term;
  }

  /** Write the stored backlog without treating xterm's replies as input. */
  writeHistoryLog(text: string): Promise<void> {
    return new Promise((resolve) => {
      const term = this.term;
      if (!term) return resolve();
      this.replayGate.begin();
      try {
        term.write(text, () => {
          this.replayGate.end();
          resolve();
        });
      } catch {
        this.replayGate.end();
        resolve();
      }
    });
  }

  clearTerminal = () => this.term?.clear();

  sendCommand(command: string) {
    setHistory(command);
    if (!this.socket?.connected) throw new Error(t("TXT_CODE_74443c8f"));
    this.socket.emit("stream/input", { data: { command } });
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.fitTask);
    clearInterval(this.statusTask);
    this.removeTouchHandlers?.();
    this.term?.dispose();
    this.term = undefined;
    this.events.removeAllListeners();
    this.manualDisconnect = true;
    this.socket?.disconnect();
    this.socket?.removeAllListeners();
    this.changeListeners.clear();
  }
}
