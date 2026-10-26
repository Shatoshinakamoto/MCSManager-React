/**
 * Mod and plugin manager card (port of widgets/instance/ModManager.vue):
 * installed mods/plugins with enable/disable/delete and per-mod config files,
 * search and install from Modrinth / CurseForge / SpigotMC, uploads, and a
 * floating transfer manager. On Windows a running server locks its jars, so
 * changes can be queued until it stops.
 *
 * Third-party metadata (names, descriptions, icons) is rendered as text or
 * as http(s) <img> sources only. External project links open with noopener.
 */
import { AppstoreOutlined, LoadingOutlined, ReloadOutlined, SearchOutlined, UploadOutlined } from "@ant-design/icons";
import { Alert, App, Badge, Button, Col, Flex, Form, Input, Row, Select, Space, Tabs, Typography, type TableColumnsType, type TablePaginationConfig } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import BetweenMenus from "@/components/BetweenMenus";
import CardPanel from "@/components/CardPanel";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useFileManager } from "@/hooks/useFileManager";
import { useInstanceInfo } from "@/hooks/useInstance";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { getModConfigFilesApi } from "@/services/apis/modManager";
import type { LayoutCard } from "@/types";
import { openFileEditor } from "./dialogs/FileEditor";
import LocalModTable from "./mod-manager/LocalModTable";
import ModConfigModal, { type ModConfigFile } from "./mod-manager/ModConfigModal";
import ModFloatingTools from "./mod-manager/ModFloatingTools";
import ModVersionModal from "./mod-manager/ModVersionModal";
import SearchModTable from "./mod-manager/SearchModTable";
import { TAB_KEY_DOWNLOAD, TAB_KEY_MODS, TAB_KEY_PLUGINS } from "./mod-manager/tabs";
import type { LocalMod, ModVersion, SearchHit } from "./mod-manager/types";
import { useDeferredTasks, type DeferredType } from "./mod-manager/useDeferredTasks";
import { useLocalMods } from "./mod-manager/useLocalMods";
import { useModSearch } from "./mod-manager/useModSearch";
import "./ModManager.scss";

const SEARCH_DELAY_MS = 600;
const BADGE_STYLE = { backgroundColor: "#f0f0f0", color: "#555", boxShadow: "none" };

export default function ModManager({ card }: { card: LayoutCard }) {
  const { message, modal } = App.useApp();
  const { isPhone } = useScreen();
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const instanceId = getMetaOrRouteValue("instanceId") ?? "";
  const daemonId = getMetaOrRouteValue("daemonId") ?? "";
  const { instanceInfo, isRunning: isInstanceRunning } = useInstanceInfo({ instanceId, daemonId, autoRefresh: true });
  const fm = useFileManager(instanceId, daemonId);

  const [activeKey, setActiveKey] = useState(TAB_KEY_MODS);
  const [headerSearchQuery, setHeaderSearchQuery] = useState("");
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;
  const headerRef = useRef(headerSearchQuery);
  headerRef.current = headerSearchQuery;

  const config = instanceInfo?.config;
  const cwd = config?.cwd || "";
  // Windows: CRLF flag 2, or a drive-letter / backslash working directory.
  const isWindows = config?.crlf === 2 || /^[a-zA-Z]:\\/.test(cwd) || cwd.includes("\\");
  const isRunning = instanceInfo?.status === 2 || instanceInfo?.status === 3;

  const getCurrentFolder = () => (activeKeyRef.current === TAB_KEY_MODS ? "mods" : activeKeyRef.current === TAB_KEY_PLUGINS ? "plugins" : undefined);

  // loadMods is defined below; the deferred-task hook needs a stable reference to it.
  const loadModsRef = useRef<(folder?: string) => Promise<void>>(async () => undefined);
  const reload = useCallback(() => loadModsRef.current(), []);
  const deferred = useDeferredTasks(instanceId, reload);

  const checkAndConfirm = useCallback(
    (type: DeferredType, name: string, data: Record<string, any>, immediateFn: () => Promise<void>) => {
      if (!(isWindows && isRunning)) return void immediateFn();
      const inst = modal.confirm({
        title: t("TXT_CODE_MOD_WIN_FILE_LOCK_TITLE"),
        content: t("TXT_CODE_MOD_WIN_FILE_LOCK_DESC"),
        closable: true,
        mask: { closable: true },
        footer: (
          <div style={{ marginTop: 24, textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={() => inst.destroy()}>{t("TXT_CODE_a0451c97")}</Button>
            <Button
              danger
              onClick={() => {
                inst.destroy();
                void immediateFn();
              }}
            >
              {t("TXT_CODE_MOD_TRY_IMMEDIATELY")}
            </Button>
            <Button
              type="primary"
              onClick={() => {
                inst.destroy();
                void deferred.addDeferredTask(type, name, data);
              }}
            >
              {t("TXT_CODE_MOD_ADD_TO_QUEUE")}
            </Button>
          </div>
        )
      });
    },
    [isWindows, isRunning, modal, deferred]
  );

  const local = useLocalMods(instanceId, daemonId, checkAndConfirm);
  const { mods, folders, loading, loadingExtra, pagination, setPagination } = local;

  const loadMods = useCallback(async (folder?: string) => {
    const target = folder !== undefined ? folder : getCurrentFolder();
    await local.loadMods(target, headerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local.loadMods]);
  loadModsRef.current = loadMods;

  const modsRef = useRef(mods);
  modsRef.current = mods;
  const search = useModSearch(instanceId, daemonId, () => modsRef.current, () => loadMods(), folders);

  // Initial load.
  useEffect(() => {
    void loadMods(getCurrentFolder());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh when the server stops (file locks are released).
  const wasRunning = useRef(isInstanceRunning);
  useEffect(() => {
    if (wasRunning.current && !isInstanceRunning) void loadMods();
    wasRunning.current = isInstanceRunning;
  }, [isInstanceRunning, loadMods]);

  // Header search: reload after typing pauses.
  const firstSearch = useRef(true);
  useEffect(() => {
    if (firstSearch.current) return void (firstSearch.current = false);
    const timer = setTimeout(() => {
      setPagination((p) => ({ ...p, current: 1 }));
      local.state.current.current = 1;
      void loadMods();
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerSearchQuery]);

  const hasModsFolder = folders.includes("mods");
  const hasPluginsFolder = folders.includes("plugins");

  // Pick a valid tab when folders change (upstream watch, immediate).
  useEffect(() => {
    if (loading) return;
    if (hasModsFolder && activeKey === TAB_KEY_MODS) return;
    if (hasPluginsFolder && activeKey === TAB_KEY_PLUGINS) return;
    if (activeKey === TAB_KEY_DOWNLOAD) return;
    setActiveKey(hasModsFolder ? TAB_KEY_MODS : hasPluginsFolder ? TAB_KEY_PLUGINS : TAB_KEY_DOWNLOAD);
  }, [hasModsFolder, hasPluginsFolder, loading, activeKey]);

  const openExternal = (mod: { source?: string; id?: string; slug?: string }) => {
    const { source, id, slug } = mod;
    const map: Record<string, string> = {
      Modrinth: `https://modrinth.com/project/${encodeURIComponent(slug || id || "")}`,
      CurseForge: `https://www.curseforge.com/projects/${encodeURIComponent(id || "")}`,
      SpigotMC: `https://www.spigotmc.org/resources/${encodeURIComponent(id || "")}`,
      MCMod: `https://www.mcmod.cn/class/${encodeURIComponent(id || "")}.html`
    };
    const url = source ? map[source] : undefined;
    if (!url) message.error(t("TXT_CODE_8d2a42a2"));
    else window.open(url, "_blank", "noopener");
  };

  const handleDownload = async (version: ModVersion) => {
    const task = await search.onDownload(version);
    if (task) checkAndConfirm(task.type, task.name, task.data, task.immediateFn);
  };

  // ---- uploads ----
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const targetDir = () => (activeKeyRef.current === TAB_KEY_MODS ? "mods" : "plugins");

  const uploadFiles = async (files: File[]) => {
    // Folders arrive as zero-byte entries; drop them.
    const valid = files.filter((f) => f.size > 0);
    if (!valid.length) return void message.warning(t("TXT_CODE_MOD_UPLOAD_NO_FOLDER"));
    await fm.selectedFiles(valid, targetDir(), async () => {
      await loadMods();
    });
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (activeKey === TAB_KEY_DOWNLOAD) return;
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    if (e.relatedTarget === null || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (activeKey === TAB_KEY_DOWNLOAD) return;
    const valid = Array.from(e.dataTransfer.files || []).filter((f) => f.size > 0);
    if (!valid.length) return void message.warning(t("TXT_CODE_MOD_UPLOAD_NO_FOLDER"));
    let name = valid.length === 1 ? valid[0].name : valid.map((f) => f.name).join(", ");
    if (name.length > 30) name = name.slice(0, 27) + "...";
    if (valid.length > 1) name += ` (${valid.length})`;
    modal.confirm({
      title: t("TXT_CODE_CONFIRM_UPLOAD"),
      content: `${t("TXT_CODE_CONFIRM_UPLOAD")} ${name} ?`,
      onOk: () => uploadFiles(valid)
    });
  };

  // ---- per-mod config files ----
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [currentMod, setCurrentMod] = useState<LocalMod | null>(null);
  const [configFiles, setConfigFiles] = useState<ModConfigFile[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const openConfig = async (record: LocalMod) => {
    setCurrentMod(record);
    setShowConfigModal(true);
    setConfigLoading(true);
    setConfigFiles([]);
    try {
      const res = await getModConfigFilesApi({
        forceRequest: true,
        params: { daemonId, uuid: instanceId, modId: record.id || record.name || "", fileName: record.file, type: record.type || "" }
      });
      setConfigFiles(res || []);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setConfigLoading(false);
    }
  };
  const editFile = (file: ModConfigFile) => {
    setShowConfigModal(false);
    void openFileEditor({ daemonId, instanceId, path: file.path, fileName: file.name });
  };

  // ---- tables ----
  const filterBySearch = (list: LocalMod[]) => {
    const q = headerSearchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((m) => (m.name || "").toLowerCase().includes(q) || (m.file || "").toLowerCase().includes(q));
  };
  const filteredMods = filterBySearch(mods);

  const columns = useMemo<TableColumnsType<LocalMod>>(() => {
    const cols: TableColumnsType<LocalMod> = [
      { title: "", key: "icon", dataIndex: "icon", width: isPhone ? 50 : 60, align: "center" },
      { title: t("TXT_CODE_NAME"), key: "name", dataIndex: "name", sorter: (a, b) => (a.name || "").localeCompare(b.name || "") }
    ];
    if (!isPhone)
      cols.push(
        { title: t("TXT_CODE_VERSION"), key: "version", dataIndex: "version", width: 140 },
        { title: t("TXT_CODE_STATUS"), key: "enabled", dataIndex: "enabled", width: 100, align: "center", sorter: (a, b) => (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1) }
      );
    cols.push({ title: t("TXT_CODE_OPERATE"), key: "action", dataIndex: "action", width: isPhone ? 90 : 160, align: "center" });
    return cols;
  }, [isPhone]);

  const searchColumns = useMemo<TableColumnsType<SearchHit>>(() => {
    const cols: TableColumnsType<SearchHit> = [
      { title: "", key: "icon", dataIndex: "icon", width: isPhone ? 50 : 60, align: "center" },
      { title: t("TXT_CODE_NAME"), key: "name", dataIndex: "name" }
    ];
    if (!isPhone)
      cols.push(
        { title: t("TXT_CODE_VERSION"), key: "version", dataIndex: "version", width: 160, align: "left" },
        { title: t("TXT_CODE_TYPE"), key: "type", dataIndex: "type", width: 100, align: "center" },
        { title: t("TXT_CODE_SOURCE"), key: "source", dataIndex: "source", width: 120, align: "center" }
      );
    cols.push({ title: t("TXT_CODE_OPERATE"), key: "action", dataIndex: "action", width: isPhone ? 90 : 120, align: "center" });
    return cols;
  }, [isPhone]);

  const tablePagination: TablePaginationConfig = {
    current: pagination.current,
    pageSize: pagination.pageSize,
    total: pagination.total,
    showSizeChanger: true,
    // Upstream asks for "large", which antd-vue ignores; "middle" is the matching default here.
    size: "middle",
    pageSizeOptions: ["10", "20", "50"],
    showTotal: (total) => t("TXT_CODE_TOTAL_ITEMS", { total })
  };

  const handleTableChange = (p: TablePaginationConfig) => {
    if (pagination.current === p.current && pagination.pageSize === p.pageSize) return;
    const next = { ...pagination, current: p.current || 1, pageSize: p.pageSize || 50 };
    setPagination(next);
    local.state.current.current = next.current;
    local.state.current.pageSize = next.pageSize;
    void loadMods(getCurrentFolder());
  };

  const handleTabChange = (key: string) => {
    setActiveKey(key);
    activeKeyRef.current = key;
    setPagination((p) => ({ ...p, current: 1 }));
    local.state.current.current = 1;
    if (key === TAB_KEY_MODS || key === TAB_KEY_PLUGINS) void loadMods(key === TAB_KEY_MODS ? "mods" : "plugins");
  };

  const tabLabel = (text: string, key: string) => (
    <Flex align="center" gap={6}>
      {text}
      {!loading && activeKey === key && <Badge count={filteredMods.length} showZero overflowCount={999} style={BADGE_STYLE} size="small" />}
      {(loading || loadingExtra) && <LoadingOutlined style={{ fontSize: 12, color: "#1890ff" }} />}
    </Flex>
  );

  const localTable = (key: string) => (
    <div className={isPhone ? "p-2" : "p-10"}>
      <LocalModTable
        key={key}
        loading={loading}
        dataSource={filteredMods}
        columns={columns}
        pagination={tablePagination}
        onChange={handleTableChange}
        onToggle={local.onToggle}
        onDelete={local.onDelete}
        onConfig={(m) => void openConfig(m)}
        onOpenExternal={openExternal}
      />
    </div>
  );

  const f = search.searchFilters;
  const downloadTab = (
    <div className={isPhone ? "p-2" : "p-10"}>
      <div>
        <Form layout="horizontal" className="search-form" labelAlign="left">
          <Row gutter={isPhone ? [8, 8] : [24, 0]} style={{ marginTop: 10 }}>
            <Col span={isPhone ? 24 : 4}>
              <Form.Item>
                <Input value={f.query} placeholder={t("TXT_CODE_SEARCH_PLACEHOLDER")} onChange={(e) => search.updateFilters({ query: e.target.value })} onPressEnter={() => void search.onSearch()} />
              </Form.Item>
            </Col>
            <Col span={isPhone ? 12 : 4}>
              <Form.Item>
                <Select
                  value={f.source}
                  onChange={(v) => search.updateFilters({ source: v })}
                  options={[
                    { value: "all", label: t("TXT_CODE_9693b0e1") },
                    { value: "modrinth", label: "Modrinth" },
                    { value: "curseforge", label: "CurseForge" },
                    { value: "spigotmc", label: "SpigotMC" }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={isPhone ? 12 : 4}>
              <Form.Item>
                <Select
                  value={f.version}
                  showSearch
                  allowClear
                  placeholder={t("TXT_CODE_743b4fe7")}
                  onChange={(v) => search.updateFilters({ version: v ?? "" })}
                  options={[{ value: "", label: t("TXT_CODE_2af87548") }, ...search.mcVersions.map((v) => ({ value: v, label: v }))]}
                />
              </Form.Item>
            </Col>
            <Col span={isPhone ? 12 : 4}>
              <Form.Item>
                <Select
                  value={f.type}
                  onChange={(v) => search.updateFilters({ type: v })}
                  options={[
                    { value: "all", label: t("TXT_CODE_cc4db8f0") },
                    { value: "mod", label: t("TXT_CODE_MOD") },
                    { value: "plugin", label: t("TXT_CODE_PLUGIN") }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={isPhone ? 12 : 4}>
              <Form.Item>
                <Select
                  value={f.environment}
                  onChange={(v) => search.updateFilters({ environment: v })}
                  options={[
                    { value: "all", label: t("TXT_CODE_74e77b4c") },
                    { value: "server", label: t("TXT_CODE_SERVER") },
                    { value: "client", label: t("TXT_CODE_CLIENT") }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={isPhone ? 12 : 4}>
              <Form.Item>
                <Select
                  value={f.loader}
                  showSearch
                  allowClear
                  options={search.loaderOptions}
                  optionFilterProp="label"
                  style={{ width: "100%" }}
                  placeholder={t("TXT_CODE_SELECT_LOADER")}
                  onChange={(v) => search.updateFilters({ loader: v ?? "" })}
                />
              </Form.Item>
            </Col>
          </Row>
          <div className="flex gap-8 justify-end mt-2">
            <Button type="primary" loading={search.searchLoading} icon={<SearchOutlined />} onClick={() => void search.onSearch()}>
              {t("TXT_CODE_SEARCH")}
            </Button>
            <Button onClick={search.resetSearch}>{t("TXT_CODE_880fedf7")}</Button>
          </div>
        </Form>
      </div>
      <SearchModTable
        loading={search.searchLoading}
        dataSource={search.searchResults}
        columns={searchColumns}
        mods={mods}
        pagination={{
          current: search.searchPage,
          pageSize: search.searchLimit,
          total: search.searchTotal,
          showSizeChanger: true,
          size: "middle",
          pageSizeOptions: ["10", "20", "50"],
          showTotal: (total) => t("TXT_CODE_TOTAL_ITEMS", { total })
        }}
        onChange={(p) => void search.onSearch(p.current, p.pageSize)}
        onShowVersions={(m) => void search.showVersions(m)}
        onOpenExternal={openExternal}
      />
    </div>
  );

  const tabItems = [
    ...(hasModsFolder ? [{ key: TAB_KEY_MODS, label: tabLabel(t("TXT_CODE_MOD_LIST"), TAB_KEY_MODS), children: localTable(TAB_KEY_MODS) }] : []),
    ...(hasPluginsFolder ? [{ key: TAB_KEY_PLUGINS, label: tabLabel(t("TXT_CODE_PLUGIN_LIST"), TAB_KEY_PLUGINS), children: localTable(TAB_KEY_PLUGINS) }] : []),
    { key: TAB_KEY_DOWNLOAD, label: t("TXT_CODE_25bf0004"), children: downloadTab }
  ];

  const isListTab = activeKey === TAB_KEY_MODS || activeKey === TAB_KEY_PLUGINS;

  return (
    <div className="container InstanceModManager">
      <Row gutter={[24, 16]}>
        <Col span={24}>
          <BetweenMenus
            left={
              !isPhone ? (
                <Typography.Title className="mb-0" level={4}>
                  <AppstoreOutlined className="mr-1" /> {t("TXT_CODE_MOD_MANAGER")}
                </Typography.Title>
              ) : (
                <div style={{ width: 40 }}></div>
              )
            }
            center={
              isListTab && (
                <div className="search-input">
                  <Input
                    value={headerSearchQuery}
                    placeholder={t("TXT_CODE_SEARCH_PLACEHOLDER")}
                    allowClear
                    style={{ width: isPhone ? 180 : 300 }}
                    suffix={<SearchOutlined />}
                    onChange={(e) => setHeaderSearchQuery(e.target.value)}
                  />
                </div>
              )
            }
            right={
              <Space>
                {isListTab && (
                  <Button icon={<UploadOutlined />} onClick={() => fileInput.current?.click()}>
                    {t("TXT_CODE_ae09d79d")}
                  </Button>
                )}
                {activeKey !== TAB_KEY_DOWNLOAD && (
                  <Button type="primary" loading={loading} icon={<ReloadOutlined />} onClick={() => void loadMods()}>
                    {t("TXT_CODE_REFRESH")}
                  </Button>
                )}
              </Space>
            }
          />
        </Col>

        <Col span={24}>
          <CardPanel className="containerWrapper" padding={false}>
            <div className={isPhone ? "p-2" : "p-4"} style={{ position: "relative" }} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
              {dragging && (
                <div className="drag-upload-mask">
                  <div className="text-center">
                    <UploadOutlined style={{ fontSize: 48, color: "var(--ant-primary-color)" }} />
                    <div className="mt-2 text-lg font-bold" style={{ color: "var(--ant-primary-color)" }}>
                      {t("TXT_CODE_DRAG_TO_UPLOAD")}
                    </div>
                  </div>
                </div>
              )}

              {isWindows && isRunning && (
                <Alert
                  type="warning"
                  showIcon
                  className="mb-4 mt-2 mod-manager-alert"
                  title={
                    <div className="text-left">
                      <div className="font-bold">{t("TXT_CODE_MOD_WIN_FILE_LOCK_TITLE")}</div>
                      <div className="text-xs opacity-80 font-normal mt-1">{t("TXT_CODE_MOD_WIN_RUNNING_ALERT")}</div>
                    </div>
                  }
                />
              )}

              <Tabs activeKey={activeKey} className="mod-manager-tabs" destroyOnHidden onChange={handleTabChange} items={tabItems} />

              <ModVersionModal
                visible={search.showVersionModal}
                onClose={() => search.setShowVersionModal(false)}
                selectedMod={search.selectedMod}
                versions={search.versions}
                versionsLoading={search.versionsLoading}
                searchFilters={search.searchFilters}
                mods={mods}
                onDownload={(v) => void handleDownload(v)}
              />

              <ModConfigModal
                visible={showConfigModal}
                onClose={() => setShowConfigModal(false)}
                currentMod={currentMod}
                configFiles={configFiles}
                configLoading={configLoading}
                onEdit={editFile}
              />
            </div>
          </CardPanel>
        </Col>
      </Row>

      <ModFloatingTools instanceId={instanceId} daemonId={daemonId} fileStatus={local.fileStatus} onRefresh={() => void loadMods()} />

      <input
        ref={fileInput}
        type="file"
        multiple
        style={{ display: "none" }}
        accept=".jar,.zip"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files || []);
          e.currentTarget.value = "";
          if (files.length) void uploadFiles(files);
        }}
      />
    </div>
  );
}
