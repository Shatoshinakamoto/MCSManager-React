/** React binding for TerminalSession: one session per mount, re-rendering on every state change. */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAppConfig } from "@/stores/appConfig";
import { INSTANCE_STATUS_CODE } from "@/types/instance";
import { TerminalSession, type TerminalSnapshot } from "./session";

const EMPTY: TerminalSnapshot = { isConnect: false, isReady: false, socketAddress: "" };
const noopSubscribe = () => () => undefined;

export function useTerminal() {
  const hasBgImage = useAppConfig((s) => s.hasBgImage);
  const [session, setSession] = useState<TerminalSession>();

  useEffect(() => {
    const s = new TerminalSession(hasBgImage);
    setSession(s);
    return () => s.dispose();
    // The background flag only matters when the terminal is created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snap = useSyncExternalStore(session?.subscribe ?? noopSubscribe, session?.getSnapshot ?? (() => EMPTY));
  const status = snap.state?.status;
  return {
    session,
    ...snap,
    isStopped: status === INSTANCE_STATUS_CODE.STOPPED,
    isRunning: status === INSTANCE_STATUS_CODE.RUNNING,
    isBuys: status === INSTANCE_STATUS_CODE.BUSY,
    isGlobalTerminal: snap.state?.config.nickname === "__MCSM_GLOBAL_INSTANCE__",
    isDockerMode: snap.state?.config.processType === "docker"
  };
}

export type UseTerminalHook = ReturnType<typeof useTerminal>;
