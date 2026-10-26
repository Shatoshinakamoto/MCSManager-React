/**
 * Search Modrinth / CurseForge / SpigotMC through the panel and install a
 * version (port of mod-manager/useModSearch.ts). The panel validates the
 * download URL (checkSafeUrl) before the daemon fetches it.
 */
import { App, Button } from "antd";
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lang/i18n";
import { deleteModApi, downloadModApi, getMcVersionsApi, getModVersionsApi, searchModsApi } from "@/services/apis/modManager";
import { useStoredState } from "./storage";
import type { LocalMod, ModVersion, SearchFilters, SearchHit } from "./types";

const MOD_LOADER_VALUES = ["forge", "fabric", "quilt", "neoforge"];
const PLUGIN_LOADER_VALUES = ["spigot", "paper", "purpur", "folia", "bungeecord", "velocity", "waterfall"];

const DEFAULT_FILTERS: SearchFilters = { query: "", source: "all", version: "", type: "all", loader: "all", environment: "server" };
const isFilters = (v: unknown): v is SearchFilters =>
  !!v && typeof v === "object" && Object.keys(DEFAULT_FILTERS).every((k) => typeof (v as Record<string, unknown>)[k] === "string");
const isLimit = (v: unknown): v is number => typeof v === "number" && [10, 20, 50].includes(v);

export interface DownloadTask {
  type: "download";
  name: string;
  data: Record<string, any>;
  immediateFn: () => Promise<void>;
}

export function useModSearch(instanceId: string, daemonId: string, getMods: () => LocalMod[], loadMods: () => Promise<void>, folders: string[]) {
  const { message, modal } = App.useApp();
  const [searchFilters, setSearchFilters] = useStoredState<SearchFilters>("mcs_mod_search_filters", DEFAULT_FILTERS, isFilters);
  const [searchLimit, setSearchLimit] = useStoredState<number>("mcs_mod_search_limit", 10, isLimit);
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const [mcVersions, setMcVersions] = useState<string[]>([]);
  const [selectedMod, setSelectedMod] = useState<SearchHit | null>(null);
  const [versions, setVersions] = useState<ModVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const latest = useRef({ searchFilters, searchLimit, selectedMod, folders });
  latest.current = { searchFilters, searchLimit, selectedMod, folders };

  const loaderOptions = useMemo(() => {
    const type = searchFilters.type;
    const groups: { label: string; options: { label: string; value: string }[] }[] = [];
    if (type !== "plugin")
      groups.push({
        label: t("TXT_CODE_LOADER"),
        options: [
          { label: t("TXT_CODE_c564f5bf"), value: "all" },
          { label: "Forge", value: "forge" },
          { label: "Fabric", value: "fabric" },
          { label: "Quilt", value: "quilt" },
          { label: "NeoForge", value: "neoforge" }
        ]
      });
    if (type !== "mod")
      groups.push({
        label: t("TXT_CODE_SERVER_PLUGIN_PLATFORM"),
        options: [
          ...(type === "plugin" ? [{ label: t("TXT_CODE_c564f5bf"), value: "all" }] : []),
          { label: "Spigot", value: "spigot" },
          { label: "Paper", value: "paper" },
          { label: "Purpur", value: "purpur" },
          { label: "Folia", value: "folia" },
          { label: "BungeeCord", value: "bungeecord" },
          { label: "Velocity", value: "velocity" },
          { label: "Waterfall", value: "waterfall" }
        ]
      });
    return groups;
  }, [searchFilters.type]);

  /** Update filters; a type change resets a loader that no longer fits (upstream watch). */
  const updateFilters = useCallback(
    (patch: Partial<SearchFilters>) =>
      setSearchFilters((f) => {
        const next = { ...f, ...patch };
        if (patch.type === "mod" && PLUGIN_LOADER_VALUES.includes(next.loader)) next.loader = "all";
        else if (patch.type === "plugin" && MOD_LOADER_VALUES.includes(next.loader)) next.loader = "all";
        return next;
      }),
    [setSearchFilters]
  );

  const loadMcVersions = useCallback(async () => {
    try {
      const res = await getMcVersionsApi();
      if (res) setMcVersions(res);
    } catch (err) {
      console.error("Failed to load MC versions:", err);
    }
  }, []);

  const resetSearch = () => {
    setSearchFilters(DEFAULT_FILTERS);
    setSearchResults([]);
    setSearchTotal(0);
    setSearchPage(1);
  };

  const onSearch = useCallback(
    async (page = 1, limit?: number) => {
      const size = limit ?? latest.current.searchLimit;
      if (limit) setSearchLimit(limit);
      setSearchLoading(true);
      setSearchPage(page);
      const f = latest.current.searchFilters;
      try {
        const res = await searchModsApi({
          forceRequest: true,
          params: { uuid: instanceId, daemonId, query: f.query, source: f.source, version: f.version, type: f.type, loader: f.loader, environment: f.environment, offset: (page - 1) * size, limit: size }
        });
        setSearchResults(res?.hits || []);
        setSearchTotal(res?.total_hits || 0);
      } catch (err) {
        message.error((err as Error).message);
      } finally {
        setSearchLoading(false);
      }
    },
    [instanceId, daemonId, message, setSearchLimit]
  );

  const showVersions = async (mod: SearchHit) => {
    setSelectedMod(mod);
    setVersions([]);
    setShowVersionModal(true);
    setVersionsLoading(true);
    try {
      const res = await getModVersionsApi({ forceRequest: true, params: { uuid: instanceId, daemonId, projectId: mod.project_id || mod.id, source: mod.source } });
      setVersions(res || []);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setVersionsLoading(false);
    }
  };

  /** Ask mods/ or plugins/ when the server has both folders; undefined when cancelled. */
  const askFolder = (detected: string) =>
    new Promise<string | undefined>((resolve) => {
      const inst = modal.confirm({
        title: t("TXT_CODE_MOD_SELECT_SAVE_DIR"),
        content: "",
        footer: createElement(
          "div",
          { style: { textAlign: "right", marginTop: 20 } },
          createElement(Button, { onClick: () => (inst.destroy(), resolve(undefined)) }, t("TXT_CODE_a0451c97")),
          createElement(Button, { type: detected === "mod" ? "primary" : "default", style: { marginLeft: 8 }, onClick: () => (inst.destroy(), resolve("mod")) }, t("TXT_CODE_MOD")),
          createElement(Button, { type: detected === "plugin" ? "primary" : "default", style: { marginLeft: 8 }, onClick: () => (inst.destroy(), resolve("plugin")) }, t("TXT_CODE_PLUGIN"))
        )
      });
    });

  /** Prepare an install; the caller runs immediateFn now or queues it. */
  const onDownload = async (version: ModVersion): Promise<DownloadTask | undefined> => {
    const file = version.files.find((f) => f.primary) || version.files[0];
    if (!file) return;
    const fallbackUrl = version.files.find((f) => f.url !== file.url)?.url;
    const mod = latest.current.selectedMod;

    let detectedType = version.project_type || mod?.project_type || "mod";
    if (version.loaders?.some((l) => PLUGIN_LOADER_VALUES.includes(l.toLowerCase())) || mod?.source === "SpigotMC") detectedType = "plugin";

    let finalType: string | undefined = detectedType;
    const hasMods = latest.current.folders.includes("mods");
    const hasPlugins = latest.current.folders.includes("plugins");
    if (hasMods && hasPlugins) {
      finalType = await askFolder(detectedType);
      if (!finalType) return;
    } else if (hasPlugins) finalType = "plugin";
    else if (hasMods) finalType = "mod";

    const downloadData = {
      uuid: instanceId,
      daemonId,
      url: file.url,
      fallbackUrl,
      fileName: file.filename || file.name || file.url?.split("/").pop() || "",
      projectType: finalType
    };

    const immediateFn = async () => {
      try {
        const existing = getMods().find((m) => m.extraInfo?.project?.id === mod?.id);
        await downloadModApi({
          forceRequest: true,
          data: {
            ...downloadData,
            extraInfo: {
              project: { id: mod?.id, name: mod?.title || mod?.name, icon_url: mod?.icon_url || mod?.thumbnail },
              version: { id: version.id, name: version.name, version_number: version.version_number },
              source: mod?.source
            }
          }
        });
        // Replace the previously installed version of the same project.
        if (existing) {
          await deleteModApi({ forceRequest: true, data: { uuid: instanceId, daemonId, fileName: existing.file } }).catch((e) => console.warn("Failed to delete old mod version:", e));
        }
        const targetTab = finalType === "plugin" ? t("TXT_CODE_PLUGIN_LIST") : t("TXT_CODE_MOD_LIST");
        message.success(`${t("TXT_CODE_38fb23a8")} -> ${targetTab}`);
        setShowVersionModal(false);
        await loadMods();
      } catch (err) {
        message.error((err as Error).message);
      }
    };
    return { type: "download", name: file.filename || downloadData.fileName, data: downloadData, immediateFn };
  };

  useEffect(() => {
    void loadMcVersions();
  }, [loadMcVersions]);

  return {
    searchFilters,
    updateFilters,
    searchResults,
    searchLoading,
    searchPage,
    searchTotal,
    searchLimit,
    mcVersions,
    loaderOptions,
    resetSearch,
    onSearch,
    selectedMod,
    versions,
    versionsLoading,
    showVersionModal,
    setShowVersionModal,
    showVersions,
    onDownload
  };
}
