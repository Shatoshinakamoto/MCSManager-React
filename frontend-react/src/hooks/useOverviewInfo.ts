/**
 * Shared poll of GET /api/overview (port of upstream hooks/useOverviewInfo.ts).
 *
 * Upstream started one 3 s timer per widget. Here every mounted widget shares
 * one timer through a reference count, so a dashboard with eight overview
 * cards makes one request every 3 s instead of eight.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { overviewInfo } from "@/services/apis";
import type { ComputedNode, ComputedOverview, OverviewResponse } from "@/types/overview";

export const OVERVIEW_POLL_MS = 3000;

/** Derived fields, same maths as upstream computeResponseData(). */
export function computeOverview(raw: OverviewResponse): ComputedOverview {
  let totalInstance = 0;
  let runningInstance = 0;
  for (const r of raw.remote || []) {
    if (r.instance) {
      totalInstance += r.instance.total;
      runningInstance += r.instance.running;
    }
  }
  const remote: ComputedNode[] = (raw.remote || []).map((node) => {
    if (!node.system || !node.instance || !node.cpuMemChart) return { ...node };
    const free = Number(node.system.freemem / 1024 / 1024 / 1024).toFixed(1);
    const total = Number(node.system.totalmem / 1024 / 1024 / 1024).toFixed(1);
    const used = Number(Number(total) - Number(free)).toFixed(1);
    return {
      ...node,
      platformText: node.system.platform == "win32" ? "windows" : node.system.platform || "--",
      instanceStatus: `${node.instance.running} / ${node.instance.total}`,
      cpuInfo: `${Number(node.system.cpuUsage * 100).toFixed(1)}%`,
      memText: `${used}G / ${total}G`,
      cpuChartData: node.cpuMemChart.map((v) => v.cpu),
      memChartData: node.cpuMemChart.map((v) => v.mem)
    };
  });
  return {
    ...raw,
    remote,
    totalInstance,
    runningInstance,
    cpu: Number(Number(raw.system.cpu * 100).toFixed(0)),
    mem: Number(Number((raw.system.freemem / raw.system.totalmem) * 100).toFixed(0))
  };
}

interface OverviewStore {
  state?: ComputedOverview;
  subscribers: number;
  timer?: ReturnType<typeof setInterval>;
  refresh: (force?: boolean) => Promise<ComputedOverview | undefined>;
  subscribe: () => () => void;
}

export const useOverviewStore = create<OverviewStore>((set, get) => ({
  state: undefined,
  subscribers: 0,
  refresh: async (force = false) => {
    try {
      const raw = await overviewInfo({ forceRequest: force });
      if (!raw || !raw.system) return get().state;
      const state = computeOverview(raw);
      set({ state });
      return state;
    } catch {
      // Keep the last good state; the next tick retries.
      return get().state;
    }
  },
  subscribe: () => {
    const n = get().subscribers + 1;
    set({ subscribers: n });
    if (n === 1) {
      void get().refresh(true);
      set({ timer: setInterval(() => void get().refresh(true), OVERVIEW_POLL_MS) });
    }
    return () => {
      const left = get().subscribers - 1;
      set({ subscribers: left });
      if (left === 0) {
        const t = get().timer;
        if (t) clearInterval(t);
        set({ timer: undefined });
      }
    };
  }
}));

/** Subscribe the calling widget to the shared overview poll. */
export function useOverviewInfo() {
  const state = useOverviewStore((s) => s.state);
  const refresh = useOverviewStore((s) => s.refresh);
  useEffect(() => useOverviewStore.getState().subscribe(), []);
  return { state, refresh };
}
