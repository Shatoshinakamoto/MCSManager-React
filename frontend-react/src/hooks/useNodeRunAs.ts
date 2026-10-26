/**
 * "Run as" capability of one daemon, read from the shared overview poll.
 * The panel and daemon enforce the rules; this only decides what the
 * instance settings dialog shows (docs/features/run-as-user.md).
 *
 * An instance linked to an OS account through its users runs as that account
 * on Linux and macOS, whatever "Run as" says, so the field is locked and shows
 * the linked account (docs/features/os-user-accounts.md). On Windows a link
 * only grants folder access, so the Windows lock stays.
 */
import { useEffect } from "react";
import { useOverviewStore } from "@/hooks/useOverviewInfo";
import type { NodeRunAsInfo } from "@/types/overview";

export function useNodeRunAs(daemonId: string): NodeRunAsInfo | undefined {
  const node = useOverviewStore((s) => s.state?.remote?.find((r) => r.uuid === daemonId));
  const loaded = useOverviewStore((s) => !!s.state);
  useEffect(() => {
    if (!loaded && daemonId) void useOverviewStore.getState().refresh();
  }, [loaded, daemonId]);
  return node?.runAs;
}

export type RunAsFieldState =
  | { kind: "edit"; options?: string[] }
  | { kind: "locked"; reason: "not-web-admin" | "not-root" | "windows" | "global" | "linked" };

/** What the "Run as" field may do for this viewer, daemon and instance type. */
export function runAsFieldState(opts: {
  isWebAdmin: boolean;
  isGlobal: boolean;
  isDocker: boolean;
  info?: NodeRunAsInfo;
  /** The instance's linked OS account (config.osAccount), if any. */
  linkedAccount?: string;
}): RunAsFieldState {
  const { isWebAdmin, isGlobal, isDocker, info, linkedAccount } = opts;
  if (isGlobal) return { kind: "locked", reason: "global" };
  if (linkedAccount && info?.platform !== "win32") return { kind: "locked", reason: "linked" };
  if (!isWebAdmin) return { kind: "locked", reason: "not-web-admin" };
  // Docker maps runAs to the container user; that needs no root on the host.
  if (isDocker) return { kind: "edit" };
  if (info?.platform === "win32") return { kind: "locked", reason: "windows" };
  // An older daemon does not report the capability: keep upstream's free-text field.
  if (info && !info.supported) return { kind: "locked", reason: "not-root" };
  return { kind: "edit", options: info?.allowedUsers?.length ? info.allowedUsers : undefined };
}
