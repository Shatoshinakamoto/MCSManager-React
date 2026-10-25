/**
 * Instance card (port of widgets/instance/Shortcut.vue). Used by InstanceList
 * with a known instance, and on its own as the "InstanceShortcut" widget,
 * where it reads instanceId/daemonId from card meta or the route and polls.
 */
import {
  CheckCircleOutlined,
  CloseOutlined,
  CloudDownloadOutlined,
  CodeOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  TagsOutlined,
  UserOutlined
} from "@ant-design/icons";
import { App, Button, Divider, Space, Tag, Tooltip, Typography } from "antd";
import prettyBytes, { type Options as PrettyOptions } from "pretty-bytes";
import { useState, type ComponentType, type MouseEvent } from "react";
import CardPanel from "@/components/CardPanel";
import { openInstanceTagsEditor } from "@/components/fc/TagsDialog";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useInstanceInfo, verifyEULA } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import { killInstance, openInstance, restartInstance, stopInstance, updateInstance } from "@/services/apis/instance";
import { useLayoutContainer } from "@/stores/layoutContainer";
import { arrayFilter } from "@/tools/array";
import { formatMemoryUsage } from "@/tools/memory";
import { parseTimestamp } from "@/tools/time";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard } from "@/types";
import type { InstanceDetail } from "@/types/instance";
import { openDeleteInstanceDialog } from "./dialogs/DeleteInstanceDialog";
import "./Shortcut.scss";

interface Props {
  card: LayoutCard;
  targetInstanceInfo?: InstanceDetail;
  targetDaemonId?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  onRefreshList?: () => void;
}

type ActName = "start" | "stop" | "restart" | "kill" | "update";

interface Operation {
  title?: string;
  icon?: ComponentType<{ style?: React.CSSProperties }>;
  click?: (e: MouseEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  danger?: boolean;
  area?: boolean;
  condition?: () => boolean;
}

const prettyBytesConfig: PrettyOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2, binary: true };

const formatStorageUsage = (usage?: number, limit?: number) => {
  const fUsage = prettyBytes(usage ?? 0, prettyBytesConfig);
  const fLimit = prettyBytes(limit ?? 0, prettyBytesConfig);
  return limit ? `${fUsage} / ${fLimit}` : fUsage;
};
const formatNetworkSpeed = (bytes?: number) => prettyBytes(bytes ?? 0, { ...prettyBytesConfig, binary: false }) + "/s";

export default function Shortcut({ card, targetInstanceInfo, targetDaemonId, className, style, onClick, onRefreshList }: Props) {
  const { modal, message } = App.useApp();
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const { toPage } = useAppRouters();
  const instanceId = targetInstanceInfo?.instanceUuid || getMetaOrRouteValue("instanceId", false) || "";
  const daemonId = targetDaemonId || getMetaOrRouteValue("daemonId", false) || "";

  const { statusText, isRunning, isStopped, isStarting, instanceTypeText, instanceInfo, execute } = useInstanceInfo({
    instanceId: targetInstanceInfo ? undefined : instanceId,
    daemonId: targetInstanceInfo ? undefined : daemonId,
    autoRefresh: !targetInstanceInfo,
    instanceInfo: targetInstanceInfo
  });

  const [loading, setLoading] = useState<Partial<Record<ActName, boolean>>>({});
  const operationConfig = { params: { uuid: instanceId, daemonId } };

  const refreshList = () =>
    setTimeout(() => {
      onRefreshList?.();
      if (!targetInstanceInfo) void execute().catch(() => undefined);
    }, 500);

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
    },
    kill: async () => {
      await killInstance(operationConfig);
      message.success(t("TXT_CODE_efb6d377"));
    },
    update: async () => {
      await updateInstance({ params: { uuid: instanceId, daemonId, task_name: "update" }, data: { time: Date.now() } });
      message.success(t("TXT_CODE_b1600db0"));
    }
  };

  const execInstanceAction = async (actName: ActName) => {
    setLoading((l) => ({ ...l, [actName]: true }));
    try {
      await actions[actName]();
      refreshList();
    } catch (error) {
      reportErrorMsg(error);
    } finally {
      setLoading((l) => ({ ...l, [actName]: false }));
    }
  };

  const confirmThen = (content: string, act: ActName) =>
    modal.confirm({ title: t("TXT_CODE_893567ac"), content, onOk: () => void execInstanceAction(act) });

  const operations = arrayFilter<Operation>([
    { title: t("TXT_CODE_57245e94"), icon: PlayCircleOutlined, click: () => void execInstanceAction("start"), loading: loading.start, disabled: isDesignMode, condition: () => isStopped },
    { title: t("TXT_CODE_b1dedda3"), icon: PauseCircleOutlined, click: () => confirmThen(t("TXT_CODE_6da85509"), "stop"), loading: loading.stop, disabled: isDesignMode, condition: () => isRunning },
    { title: t("TXT_CODE_47dcfa5"), icon: RedoOutlined, click: () => confirmThen(t("TXT_CODE_f6bd907d"), "restart"), loading: loading.restart, disabled: isDesignMode, condition: () => isRunning },
    { title: t("TXT_CODE_40ca4f2"), icon: CloudDownloadOutlined, click: () => void execInstanceAction("update"), loading: loading.update, disabled: isDesignMode, condition: () => isStopped },
    { title: t("TXT_CODE_7b67813a"), icon: CloseOutlined, click: () => confirmThen(t("TXT_CODE_ec08484"), "kill"), loading: loading.kill, disabled: isDesignMode, danger: true, condition: () => !isStopped },
    { area: true },
    {
      title: t("TXT_CODE_78e88c3f"),
      icon: TagsOutlined,
      click: async () => {
        if (!instanceId || !daemonId) return;
        const tags = instanceInfo?.config.tag || [];
        const newTags = await openInstanceTagsEditor(instanceId, daemonId, tags);
        if (JSON.stringify(newTags) !== JSON.stringify(tags)) refreshList();
      },
      disabled: isDesignMode
    },
    {
      title: t("TXT_CODE_524e3036"),
      icon: CodeOutlined,
      click: () => toPage({ path: "/instances/terminal", query: { daemonId, instanceId } }),
      disabled: isDesignMode
    },
    {
      title: t("TXT_CODE_a0e19f38"),
      icon: DeleteOutlined,
      click: async () => {
        if (!(await openDeleteInstanceDialog(instanceId, daemonId))) return;
        message.success(t("TXT_CODE_f486dbb4"));
        refreshList();
      },
      danger: true,
      disabled: isDesignMode
    }
  ]);

  const info = instanceInfo?.info;
  const config = instanceInfo?.config;
  const isDocker = config?.processType === "docker";
  const line = (title: string, value: React.ReactNode, valueStyle?: React.CSSProperties) => (
    <div className="instance-info-line">
      <span className="title">{title}:</span>
      <span className="value" style={valueStyle}>
        {" "}
        {value}
      </span>
    </div>
  );

  return (
    <CardPanel
      className={["Shortcut", className].filter(Boolean).join(" ")}
      style={{ width: "100%", height: "100%", position: "relative", ...style }}
      title={config?.nickname}
      onClick={onClick}
    >
      <div className="instance-card-body">
        <Typography.Paragraph>
          <div className="mb-8 flex" style={{ flexWrap: "wrap", gap: 8 }}>
            <Tag className="m-0" color={isRunning ? "green" : isStarting ? "pink" : undefined} style={{ opacity: isRunning || isStarting ? 1 : 0.5 }}>
              <span>
                {isRunning ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />} {statusText}
              </span>
            </Tag>
            {config?.tag && config.tag.length > 0 && <div>|</div>}
            {config?.tag?.map((item) => (
              <Tag key={item} className="m-0">
                {item}
              </Tag>
            ))}
          </div>
          {line(t("TXT_CODE_2f291d8b"), instanceTypeText)}
          {line(t("TXT_CODE_34611898"), parseTimestamp(config?.lastDatetime))}
          {config?.endTime ? (
            <div className="instance-info-line">
              <span className="title">{t("TXT_CODE_fa920c0")}:</span>
              <span> {parseTimestamp(config.endTime)}</span>
            </div>
          ) : null}
          {info?.memoryUsage && !isDocker ? line(t("TXT_CODE_593ee330"), formatMemoryUsage(info.memoryUsage, info.memoryLimit)) : null}
          {isDocker && (
            <>
              {info?.cpuUsage != null && line(t("TXT_CODE_b862a158"), `${parseInt(String(info.cpuUsage))}%`)}
              {info?.memoryUsage != null && line(t("TXT_CODE_593ee330"), formatMemoryUsage(info.memoryUsage, info.memoryLimit))}
              {info?.storageUsage != null && line(t("TXT_CODE_DISK_USAGE"), formatStorageUsage(info.storageUsage, info.storageLimit))}
              {(info?.rxRate != null || info?.txRate != null) &&
                line(t("TXT_CODE_network_bandwidth"), `↓${formatNetworkSpeed(info?.rxRate)} ↑${formatNetworkSpeed(info?.txRate)}`)}
            </>
          )}
          {info?.mcPingOnline &&
            line(
              t("TXT_CODE_e4dce83f"),
              <>
                <UserOutlined /> {info.currentPlayers} / {info.maxPlayers}
              </>,
              { verticalAlign: "middle" }
            )}
        </Typography.Paragraph>

        <Space wrap size={6} className="mb-4">
          {operations.map((item, i) =>
            item.area ? (
              <Divider key={`area-${i}`} type="vertical" />
            ) : (
              <Tooltip key={item.title} title={item.title}>
                <Button
                  size="small"
                  loading={item.loading}
                  disabled={item.disabled}
                  danger={item.danger}
                  onClick={(e) => {
                    e.stopPropagation();
                    item.click?.(e);
                  }}
                >
                  {item.icon && <item.icon style={{ fontSize: 13 }} />}
                </Button>
              </Tooltip>
            )
          )}
        </Space>
      </div>
    </CardPanel>
  );
}

/** Layout widget wrapper: the standalone "InstanceShortcut" card. */
export function InstanceShortcutWidget({ card }: { card: LayoutCard }) {
  return <Shortcut card={card} />;
}
