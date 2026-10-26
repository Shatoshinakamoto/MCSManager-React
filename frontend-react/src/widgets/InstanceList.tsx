/**
 * Instances page (port of widgets/InstanceList.vue): daemon picker, status and
 * name search, tag filter, paging, multi-select batch actions, and the
 * "all daemons" tree table.
 */
import {
  AppstoreOutlined,
  CloseOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownOutlined,
  FormOutlined,
  FrownOutlined,
  InfoCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  SearchOutlined,
  WarningOutlined
} from "@ant-design/icons";
import { App, Button, Col, Dropdown, Empty, Input, Pagination, Row, Select, Space, Table, Tag, Typography, type MenuProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import BetweenMenus from "@/components/BetweenMenus";
import FadeUp from "@/components/FadeUp";
import Loading from "@/components/Loading";
import { ALL_DAEMON_MODE } from "@/config/const";
import type { WidgetProps } from "@/config/widgets";
import { instanceMoreDetail } from "@/hooks/useInstance";
import { useInstanceTagSearch, useInstanceTagTips } from "@/hooks/useInstanceTag";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import {
  batchDelete,
  batchKill,
  batchRestart,
  batchStart,
  batchStop,
  getInstanceInfo,
  remoteInstances,
  remoteInstancesGlobal,
  remoteNodeList,
  type InstanceListResponse
} from "@/services/apis/instance";
import { computeNodeName } from "@/tools/nodes";
import { reportErrorMsg } from "@/tools/validator";
import { instanceStatusLabels, type InstanceMoreDetail, type NodeStatus } from "@/types/instance";
import InstanceLine, { type TableTreeRow } from "./instance/InstanceLine";
import Shortcut from "./instance/Shortcut";
import "./InstanceList.scss";

const SELECTED_REMOTE_KEY = "pageSelectedRemote";
const GLOBAL_PAGE_SIZE = 10;
const QUERY_THROTTLE_MS = 600;

interface OperationForm {
  instanceName: string;
  currentPage: number;
  pageSize: number;
  status: string;
}

const globalNode: NodeStatus = { uuid: ALL_DAEMON_MODE, ip: "", port: 0, available: true, remarks: "" };

/** Read the remembered daemon. SECURITY: localStorage is untrusted input; validate its shape (CWE-20). */
function loadSelectedRemote(): NodeStatus | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(SELECTED_REMOTE_KEY) ?? "null") as Partial<NodeStatus> | null;
    if (!v || typeof v.uuid !== "string" || typeof v.ip !== "string") return undefined;
    return { uuid: v.uuid, ip: v.ip, port: Number(v.port) || 0, available: v.available !== false, remarks: String(v.remarks ?? "") };
  } catch {
    return undefined;
  }
}

function saveSelectedRemote(node: NodeStatus) {
  try {
    localStorage.setItem(SELECTED_REMOTE_KEY, JSON.stringify(node));
  } catch {
    /* storage blocked: the first daemon is used next time */
  }
}

const toTreeChild = (daemonId: string, inst: InstanceMoreDetail): TableTreeRow => ({
  daemonId,
  key: inst.instanceUuid,
  name: inst.config?.nickname || inst.instanceUuid,
  inst
});

export default function InstanceList({ card }: WidgetProps) {
  const { modal, notification } = App.useApp();
  const navigate = useNavigate();
  const { isPhone } = useScreen();
  const { tags: selectedTags, setRefreshFn, selectTag, removeTag, isTagSelected, clearTags, resetTags } = useInstanceTagSearch();
  const tagTips = useInstanceTagTips((s) => s.tagTips);
  const updateTagTips = useInstanceTagTips((s) => s.updateTagTips);

  const [form, setFormState] = useState<OperationForm>({ instanceName: "", currentPage: 1, pageSize: 20, status: "" });
  const [currentRemoteNode, setCurrentRemoteNode] = useState<NodeStatus>();
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [instances, setInstances] = useState<InstanceListResponse>();
  const [tableTreeData, setTableTreeData] = useState<TableTreeRow[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [multipleMode, setMultipleMode] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<InstanceMoreDetail[]>([]);

  // Async loaders read the latest values from refs, because they run between renders.
  const formRef = useRef(form);
  const nodeRef = useRef(currentRemoteNode);
  const nodesRef = useRef(nodes);
  const tagsRef = useRef(selectedTags);
  const treeRef = useRef(tableTreeData);
  formRef.current = form;
  nodeRef.current = currentRemoteNode;
  nodesRef.current = nodes;
  tagsRef.current = selectedTags;
  treeRef.current = tableTreeData;

  const setForm = (patch: Partial<OperationForm>) => {
    formRef.current = { ...formRef.current, ...patch };
    setFormState(formRef.current);
  };
  const setTree = (rows: TableTreeRow[]) => {
    treeRef.current = rows;
    setTableTreeData(rows);
  };

  const isGlobalDaemonMode = currentRemoteNode?.uuid === ALL_DAEMON_MODE;
  const instancesMoreInfo = useMemo(() => (instances?.data ?? []).map(instanceMoreDetail), [instances]);

  const initNodes = async () => {
    const list = [...((await remoteNodeList()) ?? [])].sort((a, b) => (a.available === b.available ? 0 : a.available ? -1 : 1));
    nodesRef.current = list;
    setNodes(list);
    if (list.length === 0) return reportErrorMsg(t("TXT_CODE_e3d96a26"));
    const saved = loadSelectedRemote();
    let selected: NodeStatus | undefined;
    if (saved) {
      selected = saved.uuid === ALL_DAEMON_MODE || list.some((n) => n.uuid === saved.uuid) ? saved : undefined;
    } else {
      selected = list[0];
    }
    nodeRef.current = selected;
    setCurrentRemoteNode(selected);
  };

  const initInstancesData = useCallback(async (resetPage?: boolean, daemonId?: string, instanceId?: string, tags = tagsRef.current) => {
    try {
      setSelectedInstance([]);
      if (resetPage) setForm({ currentPage: 1 });
      if (!nodeRef.current) await initNodes();
      const f = formRef.current;

      if (nodeRef.current?.uuid !== ALL_DAEMON_MODE) {
        setLoading(true);
        const res = await remoteInstances({
          params: {
            page: f.currentPage,
            page_size: f.pageSize,
            status: f.status,
            instance_name: f.instanceName.trim(),
            tag: JSON.stringify(tags),
            daemonId: nodeRef.current?.uuid ?? ""
          }
        });
        setInstances(res);
        updateTagTips(res?.allTags || []);
        return;
      }

      updateTagTips([]);
      if (daemonId && instanceId) {
        // Refresh one row in place after an action.
        const info = await getInstanceInfo({ params: { uuid: instanceId, daemonId } });
        if (!info) return;
        const d = instanceMoreDetail(info);
        setTree(
          treeRef.current.map((n) =>
            n.key !== daemonId ? n : { ...n, children: n.children?.map((c) => (c.key === instanceId ? { ...c, inst: d, name: d.config?.nickname || d.instanceUuid } : c)) }
          )
        );
        return;
      }

      setLoading(true);
      const global = await remoteInstancesGlobal({
        params: { page: 1, page_size: GLOBAL_PAGE_SIZE, status: f.status, instance_name: f.instanceName.trim() }
      });
      if (!global) return;
      const rows: TableTreeRow[] = [];
      for (const node of nodesRef.current) {
        const item = global[node.uuid];
        let children: TableTreeRow[] = [];
        let maxPage = 1;
        let page = 1;
        if (item) {
          maxPage = item.maxPage || 1;
          page = item.page || 1;
          if (!item.instances) continue;
          children = item.instances.map((inst) => toTreeChild(node.uuid, instanceMoreDetail(inst)));
          if (page < maxPage) children.push({ isLoadMore: true, daemonId: node.uuid, key: `${node.uuid}-load-more` });
        }
        rows.push({ key: node.uuid, name: computeNodeName(node.ip, node.available, node.remarks), node, maxPage, nodeCurrentPage: page, children });
      }
      setTree(rows);
      // Upstream: default-expand-all-rows.
      setExpandedKeys(rows.map((r) => r.key));
    } catch {
      reportErrorMsg(t("TXT_CODE_e109c091"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nodes with a "load more" request in flight; a second click must not append the same page twice.
  const loadingMoreNodes = useRef(new Set<string>());
  const loadMoreInstances = async (daemonId: string) => {
    if (loadingMoreNodes.current.has(daemonId)) return;
    const nodeData = treeRef.current.find((n) => n.key === daemonId);
    if (!nodeData) return;
    const nextPage = (nodeData.nodeCurrentPage || 1) + 1;
    const f = formRef.current;
    let res: InstanceListResponse | undefined;
    loadingMoreNodes.current.add(daemonId);
    try {
      res = await remoteInstances({
        params: {
          page: nextPage,
          page_size: GLOBAL_PAGE_SIZE,
          status: f.status,
          instance_name: f.instanceName.trim(),
          tag: JSON.stringify(tagsRef.current),
          daemonId
        }
      });
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      loadingMoreNodes.current.delete(daemonId);
    }
    if (!res) return;
    const existing = new Set((nodeData.children ?? []).map((c) => c.key));
    const added = res.data.map((inst) => toTreeChild(daemonId, instanceMoreDetail(inst))).filter((c) => !existing.has(c.key));
    const children = [...(nodeData.children ?? []).filter((c) => !c.isLoadMore), ...added];
    if (nextPage < res.maxPage) children.push({ isLoadMore: true, daemonId, key: `${daemonId}-load-more` });
    setTree(treeRef.current.map((n) => (n.key === daemonId ? { ...n, children, nodeCurrentPage: nextPage, maxPage: res!.maxPage } : n)));
  };

  // lodash.throttle(600) equivalent: run now, and once more at the end of the window if called again.
  const throttle = useRef<{ last: number; timer?: ReturnType<typeof setTimeout> }>({ last: 0 });
  const handleQueryInstance = () => {
    const run = () => {
      throttle.current.last = Date.now();
      throttle.current.timer = undefined;
      setSelectedInstance([]);
      void initInstancesData();
    };
    const wait = throttle.current.last + QUERY_THROTTLE_MS - Date.now();
    if (wait <= 0) run();
    else if (!throttle.current.timer) throttle.current.timer = setTimeout(run, wait);
  };

  useEffect(() => {
    setRefreshFn((tags) => void initInstancesData(false, undefined, undefined, tags));
    void initInstancesData();
    return () => clearTimeout(throttle.current.timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChangeNode = async (item: NodeStatus) => {
    nodeRef.current = item;
    setCurrentRemoteNode(item);
    resetTags();
    tagsRef.current = [];
    setSelectedInstance([]);
    await initInstancesData(true, undefined, undefined, []);
    saveSelectedRemote(item);
  };

  const toMarketPage = () => navigate(`/market?${new URLSearchParams({ daemonId: currentRemoteNode?.uuid ?? "" })}`);
  const toAppDetailPage = (daemonId: string, instanceId: string) =>
    navigate(`/instances/terminal?${new URLSearchParams({ daemonId, instanceId })}`);

  const findInstance = (item: InstanceMoreDetail) => selectedInstance.find((i) => i.instanceUuid === item.instanceUuid);
  const handleSelectInstance = (item: InstanceMoreDetail) => {
    if (!multipleMode) return toAppDetailPage(currentRemoteNode?.uuid || "", item.instanceUuid);
    setSelectedInstance((prev) => (prev.some((i) => i.instanceUuid === item.instanceUuid) ? prev.filter((i) => i.instanceUuid !== item.instanceUuid) : [...prev, item]));
  };
  const selectAllInstances = () => setSelectedInstance([...instancesMoreInfo]);
  const exitMultipleMode = () => {
    setMultipleMode(false);
    setSelectedInstance([]);
  };

  const batchOperation = async (actName: "start" | "stop" | "kill" | "restart") => {
    if (selectedInstance.length === 0) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
    const map = {
      start: [batchStart, t("TXT_CODE_2b5fd76e")],
      stop: [batchStop, t("TXT_CODE_4822a21")],
      kill: [batchKill, t("TXT_CODE_effefaab")],
      restart: [batchRestart, t("TXT_CODE_effefaab")]
    } as const;
    const [fn, msg] = map[actName];
    try {
      const ok = await fn({ data: selectedInstance.map((item) => ({ instanceUuid: item.instanceUuid, daemonId: currentRemoteNode?.uuid ?? "" })) });
      if (ok) {
        notification.success({ title: msg, description: t("TXT_CODE_1514d08f") });
        exitMultipleMode();
        await initInstancesData();
      }
    } catch (err) {
      reportErrorMsg(err);
    }
  };

  const batchDeleteInstance = (deleteFile: boolean) => {
    if (selectedInstance.length === 0) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
    const uuids = selectedInstance.map((i) => i.instanceUuid);
    const paths = selectedInstance.map((i) => i.config?.cwd).filter((p): p is string => Boolean(p));
    modal.confirm({
      title: t("TXT_CODE_2a3b0c17"),
      icon: <InfoCircleOutlined />,
      content: (
        <div>
          <p>{deleteFile ? t("TXT_CODE_18d2f8ae") : t("TXT_CODE_ac01315a")}</p>
          {paths.length > 1 ? null : (
            <p style={{ marginTop: 8, color: "#666" }}>
              {t("TXT_CODE_91d70059")}
              <br />
              {paths.join()}
            </p>
          )}
        </div>
      ),
      okText: t("TXT_CODE_d507abff"),
      onOk: async () => {
        try {
          const res = await batchDelete({ params: { daemonId: currentRemoteNode?.uuid ?? "" }, data: { uuids, deleteFile } });
          if (res) {
            exitMultipleMode();
            notification.success({ title: t("TXT_CODE_c3c06801"), description: t("TXT_CODE_50075e02") });
            await initInstancesData(true);
          }
        } catch (err) {
          reportErrorMsg(err);
        }
      }
    });
  };

  const instanceOperations: MenuProps["items"] = [
    { key: "start", icon: <PlayCircleOutlined />, label: t("TXT_CODE_57245e94"), onClick: () => void batchOperation("start") },
    { key: "stop", icon: <PauseCircleOutlined />, label: t("TXT_CODE_b1dedda3"), onClick: () => void batchOperation("stop") },
    { key: "restart", icon: <RedoOutlined />, label: t("TXT_CODE_47dcfa5"), onClick: () => void batchOperation("restart") },
    { key: "kill", icon: <CloseOutlined />, label: t("TXT_CODE_7b67813a"), onClick: () => void batchOperation("kill") },
    { key: "delete", icon: <DeleteOutlined />, label: t("TXT_CODE_ecbd7449"), onClick: () => batchDeleteInstance(false) },
    { key: "deleteFiles", icon: <WarningOutlined />, label: t("TXT_CODE_9ef27367"), onClick: () => batchDeleteInstance(true) }
  ];

  const nodeMenu: MenuProps["items"] = [
    { key: ALL_DAEMON_MODE, icon: <AppstoreOutlined />, label: t("TXT_CODE_a60a421a"), onClick: () => void handleChangeNode(globalNode) },
    { type: "divider" },
    ...nodes.map((item) => ({
      key: item.uuid,
      disabled: !item.available,
      icon: item.available ? <DatabaseOutlined /> : <FrownOutlined />,
      label: computeNodeName(item.ip, item.available, item.remarks),
      onClick: () => void handleChangeNode(item)
    })),
    { type: "divider" },
    { key: "toNodesPage", icon: <FormOutlined />, label: t("TXT_CODE_28e53fed"), onClick: () => navigate("/node") }
  ];

  const lineCell = (key: string) => (_: unknown, record: TableTreeRow) =>
    record.isLoadMore ? (
      key === "name" ? (
        <div style={{ textAlign: "center", cursor: "pointer", color: "var(--color-blue-6)" }} onClick={() => void loadMoreInstances(record.daemonId!)}>
          {t("TXT_CODE_101ef36f")}
        </div>
      ) : null
    ) : (
      <InstanceLine columnKey={key} record={record} onRefreshList={(d, i) => void initInstancesData(false, d, i)} />
    );

  const columns: ColumnsType<TableTreeRow> = [
    { title: <div style={{ marginLeft: 25 }}>{t("TXT_CODE_f70badb9")}</div>, dataIndex: "name", key: "name", width: 250, align: "left", render: lineCell("name") },
    { title: t("TXT_CODE_759fb403"), dataIndex: "status", key: "status", width: 100, align: "center", render: lineCell("status") },
    { title: t("TXT_CODE_67d68dd1"), dataIndex: "type", key: "type", width: 160, align: "center", render: lineCell("type") },
    { title: t("TXT_CODE_e06fdab0"), dataIndex: "lastDatetime", key: "lastDatetime", width: 160, align: "center", render: lineCell("lastDatetime") },
    { title: t("TXT_CODE_b283e720"), dataIndex: "resources", key: "resources", align: "left", render: lineCell("resources") },
    { title: t("TXT_CODE_7e9727bd"), dataIndex: "players", key: "players", width: 100, align: "left", render: lineCell("players") },
    { title: <div style={{ paddingRight: 10 }}>{t("TXT_CODE_fe731dfc")}</div>, dataIndex: "actions", key: "actions", width: 200, align: "right", render: lineCell("actions") }
  ];

  const statusOptions = [
    { value: "", label: t("TXT_CODE_c48f6f64") },
    ...Object.entries(instanceStatusLabels()).map(([value, label]) => ({ value, label }))
  ];

  const nodeLabel = isGlobalDaemonMode
    ? t("TXT_CODE_a60a421a")
    : computeNodeName(currentRemoteNode?.ip || "", currentRemoteNode?.available || true, currentRemoteNode?.remarks);

  return (
    <div style={{ minHeight: "100%" }} className="InstanceList container">
      <Row gutter={[24, 24]} style={{ minHeight: "100%" }}>
        <Col span={24}>
          <BetweenMenus
            left={
              !isPhone && (
                <Typography.Title className="mb-0" level={4}>
                  <AppstoreOutlined /> {card.title}
                </Typography.Title>
              )
            }
            right={
              <>
                <Dropdown menu={{ items: nodeMenu }}>
                  <Button style={{ maxWidth: 200, minWidth: 180, overflow: "hidden" }}>
                    <Typography.Text style={{ maxWidth: 145 }} ellipsis>
                      {nodeLabel}
                    </Typography.Text>
                    <DownOutlined />
                  </Button>
                </Dropdown>
                <Button type="primary" disabled={!currentRemoteNode?.available} onClick={toMarketPage}>
                  {t("TXT_CODE_53408064")}
                </Button>
              </>
            }
            center={
              <div className="search-input">
                <Space.Compact style={{ width: "100%" }}>
                  <Select
                    value={form.status}
                    style={{ width: 90 }}
                    options={statusOptions}
                    onChange={(status) => {
                      setForm({ status });
                      handleQueryInstance();
                    }}
                  />
                  <Input
                    value={form.instanceName}
                    placeholder={t("TXT_CODE_ce132192")}
                    style={{ width: "calc(100% - 90px)" }}
                    suffix={<SearchOutlined />}
                    onPressEnter={handleQueryInstance}
                    onChange={(e) => {
                      setForm({ instanceName: e.target.value.trim() });
                      handleQueryInstance();
                    }}
                  />
                </Space.Compact>
              </div>
            }
          />
        </Col>
        <Col span={24}>
          <BetweenMenus
            left={
              (instances || isGlobalDaemonMode) &&
              (multipleMode && !isGlobalDaemonMode ? (
                <div>
                  <Button className="mr-10" onClick={exitMultipleMode}>
                    {t("TXT_CODE_5366af54")}
                  </Button>
                  {instancesMoreInfo.length === selectedInstance.length ? (
                    <Button className="mr-10" onClick={() => setSelectedInstance([])}>
                      {t("TXT_CODE_df87c46d")}
                    </Button>
                  ) : (
                    <Button className="mr-10" onClick={selectAllInstances}>
                      {t("TXT_CODE_f466d7a")}
                    </Button>
                  )}
                  <Dropdown menu={{ items: instanceOperations }}>
                    <Button type="primary">
                      {t("TXT_CODE_8fd8bfd3")} <DownOutlined />
                    </Button>
                  </Dropdown>
                </div>
              ) : (
                <div>
                  {!isGlobalDaemonMode && <Button onClick={() => setMultipleMode(true)}>{t("TXT_CODE_5cb656b9")}</Button>}
                  <Button className="ml-10" onClick={handleQueryInstance}>
                    {t("TXT_CODE_b76d94e0")}
                  </Button>
                </div>
              ))
            }
            center={
              multipleMode &&
              !isGlobalDaemonMode && (
                <Typography.Text>
                  {t("TXT_CODE_432cbc38")}
                  {selectedInstance.length} {t("TXT_CODE_5cd3b4bd")}
                </Typography.Text>
              )
            }
            right={
              instances &&
              !isGlobalDaemonMode && (
                <Pagination
                  size="middle"
                  current={form.currentPage}
                  pageSize={form.pageSize}
                  total={(instances.maxPage || 0) * form.pageSize}
                  showSizeChanger
                  onChange={(currentPage, pageSize) => {
                    setForm({ currentPage, pageSize });
                    void initInstancesData();
                  }}
                />
              )
            }
          />
        </Col>
        <Col span={24}>
          {tagTips.length > 0 && (
            <div className="instances-tag-container">
              {selectedTags.length > 0 && (
                <Tag color="red" className="group-name-tag" onClick={clearTags}>
                  {t("TXT_CODE_7333c7f7")}
                </Tag>
              )}
              {tagTips.map((item) => (
                <Tag
                  key={item}
                  className={["group-name-tag", isTagSelected(item) && "group-name-tag-active"].filter(Boolean).join(" ")}
                  onClick={() => (isTagSelected(item) ? removeTag(item) : selectTag(item))}
                >
                  {item}
                </Tag>
              ))}
            </div>
          )}
        </Col>

        {isLoading ? (
          <Col span={24}>
            <Loading />
          </Col>
        ) : !isGlobalDaemonMode && instancesMoreInfo.length > 0 ? (
          <Col span={24}>
            <Row gutter={[16, 16]}>
              <FadeUp>
                {instancesMoreInfo.map((item) => (
                  <Col key={item.instanceUuid} span={24} xl={6} lg={8} sm={12}>
                    <Shortcut
                      className={["instance-card", multipleMode && findInstance(item) ? "selected" : ""].filter(Boolean).join(" ")}
                      style={{ height: "100%" }}
                      card={card}
                      targetInstanceInfo={item}
                      targetDaemonId={currentRemoteNode?.uuid}
                      onClick={() => handleSelectInstance(item)}
                      onRefreshList={() => void initInstancesData()}
                    />
                  </Col>
                ))}
              </FadeUp>
            </Row>
          </Col>
        ) : isGlobalDaemonMode ? (
          <Col span={24}>
            <FadeUp>
              <Table<TableTreeRow>
                dataSource={tableTreeData}
                columns={columns}
                pagination={false}
                size="small"
                rowKey="key"
                expandable={{ expandedRowKeys: expandedKeys, onExpandedRowsChange: (keys) => setExpandedKeys(keys as string[]) }}
                scroll={{ x: "max-content" }}
              />
            </FadeUp>
          </Col>
        ) : (
          <Col span={24} className="flex align-center justify-center h-100 w-100 flex-col" style={{ position: "relative" }}>
            <div>
              <Empty description={t("TXT_CODE_5415f009")} />
            </div>
            <div className="mt-20">
              <Button type="primary" onClick={toMarketPage}>
                {t("TXT_CODE_871cb8bc")}
              </Button>
            </div>
          </Col>
        )}
      </Row>
    </div>
  );
}
