/**
 * Installed mods/plugins list (port of mod-manager/useLocalMods.ts): paged
 * listing per folder, background metadata lookup by file hash, enable/disable
 * and delete, and polling while the daemon reports transfer tasks.
 */
import { App } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lang/i18n";
import { deleteModApi, getModBatchInfoApi, modListApi, toggleModApi } from "@/services/apis/modManager";
import type { DeferredType } from "./useDeferredTasks";
import type { LocalMod, ModListStatus } from "./types";

export type CheckAndConfirm = (type: DeferredType, name: string, data: Record<string, any>, immediateFn: () => Promise<void>) => void;

const POLL_MS = 2000;

export function useLocalMods(instanceId: string, daemonId: string, checkAndConfirm: CheckAndConfirm) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [mods, setMods] = useState<LocalMod[]>([]);
  const [folders, setFolders] = useState<string[]>(["mods", "plugins"]);
  const [fileStatus, setFileStatus] = useState<ModListStatus>({});
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 });

  // Latest values for async callbacks.
  const state = useRef({ folder: undefined as string | undefined, search: "", current: 1, pageSize: 50, mods: [] as LocalMod[] });
  state.current.mods = mods;
  state.current.current = pagination.current;
  state.current.pageSize = pagination.pageSize;

  const params = () => ({
    uuid: instanceId,
    daemonId,
    page: state.current.current,
    pageSize: state.current.pageSize,
    folder: state.current.folder,
    search: state.current.search || undefined
  });

  const loadMods = useCallback(
    async (folder?: string, search?: string) => {
      setLoading(true);
      state.current.folder = folder;
      if (search !== undefined) state.current.search = search.trim();
      try {
        const res = (await modListApi({ forceRequest: true, params: params() })) as ModListStatus | undefined;
        const newMods = res?.mods || [];
        // Keep metadata already fetched so rows do not flicker.
        const old = new Map<string, LocalMod>();
        state.current.mods.forEach((m) => {
          if (m.file) old.set(m.file, m);
          if (m.hash) old.set(m.hash, m);
        });
        newMods.forEach((m) => {
          const prev = old.get(m.file) || (m.hash ? old.get(m.hash) : undefined);
          if (prev?.extraInfo) m.extraInfo = prev.extraInfo;
        });
        setFolders(res?.folders || []);
        setFileStatus(res || {});
        setPagination((p) => ({ ...p, total: res?.total || 0 }));
        setMods(newMods);
        setLoading(false);

        const hashes = newMods.filter((m) => !m.extraInfo && m.hash).map((m) => m.hash!);
        if (hashes.length > 0) {
          setLoadingExtra(true);
          try {
            const batch = await getModBatchInfoApi({ forceRequest: true, data: { hashes } });
            if (batch) setMods((list) => list.map((m) => (m.hash && batch[m.hash] ? { ...m, extraInfo: batch[m.hash] } : m)));
          } catch (e) {
            console.error("Fetch batch info error:", e);
          } finally {
            setLoadingExtra(false);
          }
        }
      } catch (err) {
        message.error((err as Error).message);
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instanceId, daemonId, message]
  );

  const onToggle = useCallback(
    (record: LocalMod) => {
      const data = { uuid: instanceId, daemonId, fileName: record.file };
      const immediateFn = async () => {
        try {
          await toggleModApi({ forceRequest: true, data });
          message.success(t("TXT_CODE_7f0c746d"));
          setMods((list) =>
            list.map((m) =>
              m.file !== record.file ? m : m.enabled ? { ...m, file: m.file + ".disabled", enabled: false } : { ...m, file: m.file.replace(".disabled", ""), enabled: true }
            )
          );
        } catch (err) {
          message.error((err as Error).message);
        }
      };
      checkAndConfirm("toggle", record.file, data, immediateFn);
    },
    [instanceId, daemonId, checkAndConfirm, message]
  );

  const onDelete = useCallback(
    (record: LocalMod) => {
      const data = { uuid: instanceId, daemonId, fileName: record.file };
      const immediateFn = async () => {
        try {
          await deleteModApi({ forceRequest: true, data });
          message.success(t("TXT_CODE_7f0c746d"));
          setMods((list) => list.filter((m) => m.file !== record.file));
        } catch (err) {
          message.error((err as Error).message);
        }
      };
      checkAndConfirm("delete", record.file, data, immediateFn);
    },
    [instanceId, daemonId, checkAndConfirm, message]
  );

  // Poll while transfers are running, then reload once they finish.
  const hasTasks = !!fileStatus.downloadTasks?.length;
  useEffect(() => {
    if (!hasTasks) return;
    const timer = setInterval(async () => {
      try {
        const res = (await modListApi({ forceRequest: true, params: params() })) as ModListStatus | undefined;
        setFileStatus(res || {});
        if (!res?.downloadTasks?.length) {
          clearInterval(timer);
          await loadMods(state.current.folder);
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTasks, loadMods]);

  return { loading, loadingExtra, mods, folders, fileStatus, pagination, setPagination, loadMods, onToggle, onDelete, state };
}
