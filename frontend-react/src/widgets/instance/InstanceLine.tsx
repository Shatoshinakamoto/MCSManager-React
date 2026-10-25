/**
 * One cell of the "all daemons" instance table (port of widgets/instance/InstanceLine.vue).
 * Rows are either a daemon (record.node set) or an instance under it.
 */
import {
  CheckCircleOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  FrownOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  UserOutlined
} from "@ant-design/icons";
import { App, Button, Space, Tag, Typography } from "antd";
import { useState } from "react";
import { useAppRouters } from "@/hooks/useAppRouters";
import { verifyEULA } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import { openInstance, restartInstance, stopInstance } from "@/services/apis/instance";
import { formatMemoryUsage } from "@/tools/memory";
import { parseTimestamp } from "@/tools/time";
import { reportErrorMsg } from "@/tools/validator";
import { INSTANCE_STATUS_CODE, instanceStatusLabels, type InstanceMoreDetail, type NodeStatus } from "@/types/instance";
import { openDeleteInstanceDialog } from "./dialogs/DeleteInstanceDialog";

export interface TableTreeRow {
  key: string;
  name?: string;
  daemonId?: string;
  node?: NodeStatus;
  inst?: InstanceMoreDetail;
  isLoadMore?: boolean;
  maxPage?: number;
  nodeCurrentPage?: number;
  children?: TableTreeRow[];
}

type ActName = "start" | "stop" | "restart";

interface Props {
  columnKey: string;
  record: TableTreeRow;
  onRefreshList: (daemonId: string, instanceId: string) => void;
}

export default function InstanceLine({ columnKey, record, onRefreshList }: Props) {
  const { modal, message } = App.useApp();
  const { toPage } = useAppRouters();
  const [loading, setLoading] = useState<Partial<Record<ActName, boolean>>>({});
  const node = record.node;
  const inst = record.inst;
  const instanceId = inst?.instanceUuid ?? "";
  const daemonId = record.daemonId ?? "";
  const operationConfig = { params: { uuid: instanceId, daemonId } };

  const refreshList = () => setTimeout(() => onRefreshList(daemonId, instanceId), 500);

  const actions: Record<ActName, () => Promise<void>> = {
    start: async () => {
      if (!(await verifyEULA(instanceId, daemonId, modal))) return;
      await openInstance(operationConfig);
      message.success(t("TXT_CODE_e13abbb1"));
    },
    stop: async () => {
      await stopInstance(operationConfig);
      message.success(t("TXT_CODE_efb6d377"));
    },
    restart: async () => {
      await restartInstance(operationConfig);
      message.success(t("TXT_CODE_efb6d377"));
    }
  };

  const execInstanceAction = async (act: ActName) => {
    setLoading((l) => ({ ...l, [act]: true }));
    try {
      await actions[act]();
      refreshList();
    } catch (error) {
      reportErrorMsg(error);
    } finally {
      setLoading((l) => ({ ...l, [act]: false }));
    }
  };

  const tryDeleteInstance = async () => {
    if (!(await openDeleteInstanceDialog(instanceId, daemonId))) return;
    message.success(t("TXT_CODE_f486dbb4"));
    refreshList();
  };

  const toInstanceTerminal = () => toPage({ path: "/instances/terminal", query: { daemonId, instanceId } });

  if (columnKey === "name") {
    return (
      <div>
        {node && node.available && <DatabaseOutlined style={{ marginRight: 8 }} />}
        {node && !node.available && <FrownOutlined style={{ marginRight: 8 }} />}
        {!node ? (
          <a onClick={toInstanceTerminal}>
            <Typography.Text style={{ fontWeight: "normal", maxWidth: 190 }} ellipsis={{ tooltip: record.name }}>
              {record.name}
            </Typography.Text>
          </a>
        ) : (
          <span style={{ fontWeight: "bold" }}>{record.name}</span>
        )}
      </div>
    );
  }
  if (node || !inst) return null;

  switch (columnKey) {
    case "status":
      return (
        <Tag color={inst.status === INSTANCE_STATUS_CODE.RUNNING ? "green" : inst.status === INSTANCE_STATUS_CODE.STARTING ? "pink" : undefined}>
          <span>
            {inst.moreInfo?.isRunning ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}{" "}
            {instanceStatusLabels()[(inst.status ?? -1) as INSTANCE_STATUS_CODE] || t("TXT_CODE_c8333afa")}
          </span>
        </Tag>
      );
    case "type":
      return <>{inst.moreInfo?.instanceTypeText}</>;
    case "lastDatetime":
      return <>{parseTimestamp(inst.config?.lastDatetime)}</>;
    case "resources":
      return (
        <Space wrap size={4}>
          {inst.info?.cpuUsage != null && <Tag>CPU: {parseInt(String(inst.info.cpuUsage))}%</Tag>}
          {inst.info?.memoryUsage != null && <Tag>RAM: {formatMemoryUsage(inst.info.memoryUsage, inst.info.memoryLimit)}</Tag>}
        </Space>
      );
    case "players":
      return inst.info?.mcPingOnline ? (
        <div>
          <UserOutlined /> {inst.info.currentPlayers} / {inst.info.maxPlayers}
        </div>
      ) : null;
    case "actions": {
      const btn = (onClick: () => void, icon: React.ReactNode, extra: Record<string, unknown> = {}) => (
        <Button
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          {...extra}
        >
          {icon}
        </Button>
      );
      const iconStyle = { fontSize: 13 };
      return (
        <Space wrap size={6} style={{ paddingRight: 10 }}>
          {inst.moreInfo?.isStopped && btn(() => void execInstanceAction("start"), <PlayCircleOutlined style={iconStyle} />, { loading: loading.start })}
          {inst.moreInfo?.isRunning && btn(() => void execInstanceAction("stop"), <PauseCircleOutlined style={iconStyle} />, { loading: loading.stop })}
          {btn(() => void execInstanceAction("restart"), <RedoOutlined style={iconStyle} />, { loading: loading.restart, disabled: !inst.moreInfo?.isRunning })}
          {btn(toInstanceTerminal, <CodeOutlined style={iconStyle} />)}
          {btn(() => void tryDeleteInstance(), <DeleteOutlined style={iconStyle} />, { danger: true })}
        </Space>
      );
    }
    default:
      return null;
  }
}
