/**
 * Port of components/fc/SelectInstances.vue: pick instances across daemons
 * (used to assign instances to a user and to fill a card's instance params).
 *
 * openSelectInstances resolves with the selection on Save and undefined on
 * Cancel, like upstream useSelectInstances.
 *
 * Security: the remembered daemon in localStorage is shape-checked before use
 * (CWE-20); instance names render as text.
 */
import { DatabaseOutlined, DownOutlined, FormOutlined, FrownOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Col, Dropdown, Input, Modal, Pagination, Popconfirm, Row, Select, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BetweenMenus from "@/components/BetweenMenus";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { remoteInstances, remoteNodeList, type InstanceListResponse } from "@/services/apis/instance";
import { openDialog } from "@/stores/dialogHost";
import { computeNodeName } from "@/tools/nodes";
import { reportErrorMsg } from "@/tools/validator";
import type { UserInstance } from "@/types";
import { instanceStatusLabels, type NodeStatus } from "@/types/instance";

const SELECTED_REMOTE_KEY = "pageSelectedRemote";

function loadSelectedRemote(): NodeStatus | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(SELECTED_REMOTE_KEY) ?? "null") as Partial<NodeStatus> | null;
    if (!v || typeof v.uuid !== "string" || typeof v.ip !== "string") return undefined;
    return { uuid: v.uuid, ip: v.ip, port: Number(v.port) || 0, available: v.available !== false, remarks: String(v.remarks ?? "") };
  } catch {
    return undefined;
  }
}

interface Props {
  title: string;
  data: UserInstance[];
  /** Navigate to the daemons page (passed in because dialogs render outside the router). */
  toNodesPage?: () => void;
  done: (result: UserInstance[] | undefined) => void;
}

function SelectInstances({ title, data, toNodesPage, done }: Props) {
  const { isPhone } = useScreen();
  const [open, setOpen] = useState(true);
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [node, setNode] = useState<NodeStatus>();
  const [form, setForm] = useState({ instanceName: "", currentPage: 1, pageSize: 10, status: "" });
  const [instances, setInstances] = useState<InstanceListResponse>();
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<UserInstance[]>(() => (Array.isArray(data) ? structuredClone(data) : []));
  const formRef = useRef(form);
  formRef.current = form;

  const close = (result: UserInstance[] | undefined) => {
    setOpen(false);
    done(result);
  };

  const load = useCallback(async (target: NodeStatus | undefined) => {
    let current = target;
    if (!current) {
      const list = ((await remoteNodeList().catch(() => undefined)) ?? []).sort((a, b) =>
        a.available === b.available ? 0 : a.available ? -1 : 1
      );
      setNodes(list);
      if (!list.length) return reportErrorMsg(t("TXT_CODE_e3d96a26"));
      current = loadSelectedRemote() ?? list[0];
      setNode(current);
    }
    const f = formRef.current;
    setLoading(true);
    try {
      setInstances(
        await remoteInstances({
          params: { daemonId: current.uuid, page: f.currentPage, page_size: f.pageSize, status: f.status, instance_name: f.instanceName.trim() }
        })
      );
    } catch {
      reportErrorMsg(t("TXT_CODE_e109c091"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(undefined);
  }, [load]);

  // Throttled like upstream (600 ms) so typing does not flood the daemon.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const query = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(node), 600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const changeNode = (item: NodeStatus) => {
    setNode(item);
    setForm((f) => ({ ...f, currentPage: 1 }));
    formRef.current = { ...formRef.current, currentPage: 1 };
    try {
      localStorage.setItem(SELECTED_REMOTE_KEY, JSON.stringify(item));
    } catch {
      /* storage unavailable */
    }
    void load(item);
  };

  const rows = useMemo<UserInstance[]>(
    () =>
      (instances?.data ?? []).map((i) => ({
        instanceUuid: i.instanceUuid,
        daemonId: node?.uuid ?? "",
        hostIp: `${node?.ip}:${node?.port}`,
        remarks: node?.remarks,
        status: i.status,
        nickname: i.config.nickname,
        ie: i.config.ie,
        oe: i.config.oe,
        endTime: i.config.endTime,
        lastDatetime: i.config.lastDatetime,
        stopCommand: i.config.stopCommand,
        processType: i.config.processType,
        docker: i.config.docker as unknown as Record<string, unknown>,
        info: i.info as unknown as Record<string, unknown>
      })),
    [instances, node]
  );

  const isSelected = (r: UserInstance) => selected.some((i) => i.instanceUuid === r.instanceUuid);
  const statusLabels = instanceStatusLabels() as Record<string, string>;

  const columns: ColumnsType<UserInstance> = [
    { align: "center", title: t("TXT_CODE_f70badb9"), dataIndex: "nickname", key: "instanceUuid" },
    {
      align: "center",
      title: t("TXT_CODE_5def0cbe"),
      key: "safe",
      render: (_, r) =>
        r.processType === "docker" ? (
          <span style={{ color: "var(--color-green-6)" }}>{t("TXT_CODE_a3f13157")}</span>
        ) : (
          <span className="color-danger">{t("TXT_CODE_201bc643")}</span>
        )
    },
    {
      align: "center",
      title: t("TXT_CODE_fe731dfc"),
      key: "operation",
      render: (_, r) =>
        isSelected(r) ? (
          <Button danger size="middle" onClick={() => setSelected((s) => s.filter((i) => i.instanceUuid !== r.instanceUuid))}>
            {t("TXT_CODE_65fcbd09")}
          </Button>
        ) : (
          <Button size="middle" onClick={() => setSelected((s) => [...s, r])}>
            {t("TXT_CODE_7b2c5414")}
          </Button>
        )
    }
  ];

  const nodeMenu = [
    ...nodes.map((item) => ({
      key: item.uuid,
      disabled: !item.available,
      icon: item.available ? <DatabaseOutlined /> : <FrownOutlined />,
      label: computeNodeName(item.ip, item.available, item.remarks),
      onClick: () => changeNode(item)
    })),
    { type: "divider" as const },
    {
      key: "__nodes",
      icon: <FormOutlined />,
      label: t("TXT_CODE_28e53fed"),
      onClick: () => {
        toNodesPage?.();
        close(undefined);
      }
    }
  ];

  return (
    <Modal
      open={open}
      centered
      mask={{ closable: false }}
      title={title}
      onCancel={() => close(undefined)}
      footer={
        <div className="flex">
          {selected.length > 0 && (
            <Popconfirm title={t("TXT_CODE_647ea2ec")} onConfirm={() => setSelected([])}>
              <Button>{t("TXT_CODE_d258ec31")}</Button>
            </Popconfirm>
          )}
          <div style={{ marginLeft: "auto" }}>
            <Button onClick={() => close(undefined)}>{t("TXT_CODE_a0451c97")}</Button>
            <Button type="primary" onClick={() => close(selected)}>
              {t("TXT_CODE_abfe9512")}
            </Button>
          </div>
        </div>
      }
    >
      <Typography.Paragraph>
        <Typography.Text type="secondary">{t("TXT_CODE_50697989")}</Typography.Text>
      </Typography.Paragraph>
      <Row gutter={[24, 24]} style={{ height: "100%" }}>
        <Col span={24}>
          <BetweenMenus
            left={
              <Dropdown menu={{ items: nodeMenu }}>
                <Button className={isPhone ? "w-100" : undefined}>
                  {computeNodeName(node?.ip || "", node?.available ?? true, node?.remarks)}
                  <DownOutlined />
                </Button>
              </Dropdown>
            }
            right={
              <div className="search-input w-100">
                <Space.Compact style={{ minWidth: 175, width: "100%" }}>
                  <Select
                    value={form.status}
                    style={{ width: 90 }}
                    onChange={(status) => query({ status })}
                    options={[
                      { value: "", label: t("TXT_CODE_c48f6f64") },
                      ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))
                    ]}
                  />
                  <Input
                    value={form.instanceName}
                    placeholder={t("TXT_CODE_ce132192")}
                    style={{ width: "calc(100% - 90px)" }}
                    suffix={<SearchOutlined />}
                    onChange={(e) => query({ instanceName: e.target.value.trim() })}
                    onPressEnter={() => void load(node)}
                  />
                </Space.Compact>
              </div>
            }
          />
        </Col>
        <Col span={24}>
          {instances && (
            <div className="flex-between align-center">
              <Typography.Text>
                {t("TXT_CODE_379fa48a")} {selected.length} {t("TXT_CODE_5cd3b4bd")}
              </Typography.Text>
              <Pagination
                size="middle"
                current={form.currentPage}
                pageSize={form.pageSize}
                total={instances.maxPage * form.pageSize}
                showSizeChanger
                onChange={(currentPage, pageSize) => {
                  formRef.current = { ...formRef.current, currentPage, pageSize };
                  setForm(formRef.current);
                  void load(node);
                }}
              />
            </div>
          )}
        </Col>
        <Col span={24}>
          <Table
            rowKey="instanceUuid"
            loading={loading}
            dataSource={rows}
            columns={columns}
            pagination={false}
            size="small"
            scroll={{ x: "max-content" }}
          />
        </Col>
      </Row>
    </Modal>
  );
}

/** Upstream useSelectInstances. */
export function openSelectInstances(data: UserInstance[] = [], toNodesPage?: () => void): Promise<UserInstance[] | undefined> {
  return openDialog<UserInstance[] | undefined>((done) => (
    <SelectInstances title={t("TXT_CODE_8145d25a")} data={data} toNodesPage={toNodesPage} done={done} />
  ));
}
