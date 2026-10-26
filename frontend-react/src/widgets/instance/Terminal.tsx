/**
 * Instance console widget (port of widgets/instance/Terminal.vue).
 *
 * Two views, as upstream: the full-width "inner" page header with buttons
 * (card width 12 and meta viewType "inner"), or a CardPanel with icon buttons.
 * The TerminalSession lives here so the header can show live status; the
 * console body (TerminalCore) connects it on mount.
 *
 * SECURITY: these buttons only call the panel API; the panel checks the
 * user's permission for each instance action server-side.
 */
import {
  CheckCircleOutlined,
  CloseOutlined,
  CloudDownloadOutlined,
  CloudServerOutlined,
  DownOutlined,
  InfoCircleOutlined,
  InteractionOutlined,
  LaptopOutlined,
  LoadingOutlined,
  MoneyCollectOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined
} from "@ant-design/icons";
import { App, Button, Dropdown, Popconfirm, Tag, Tooltip, Typography } from "antd";
import { useEffect, useRef, useState, type ComponentType } from "react";
import BetweenMenus from "@/components/BetweenMenus";
import CardPanel from "@/components/CardPanel";
import IconBtn from "@/components/IconBtn";
import TerminalCore from "@/components/terminal/TerminalCore";
import TerminalTopTags from "@/components/terminal/TerminalTopTags";
import { GLOBAL_INSTANCE_NAME, INSTANCE_CRASH_TIMEOUT } from "@/config/const";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { instanceTypeTranslation, verifyEULA } from "@/hooks/useInstance";
import { useScreen } from "@/hooks/useScreen";
import { useTerminal } from "@/hooks/terminal/useTerminal";
import { t } from "@/lang/i18n";
import { killInstance, openInstance, restartInstance, stopInstance, updateInstance } from "@/services/apis/instance";
import { useAppState, useIsAdmin } from "@/stores/appState";
import { arrayFilter } from "@/tools/array";
import { sleep } from "@/tools/common";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard } from "@/types";
import { instanceStatusLabels, INSTANCE_STATUS_CODE } from "@/types/instance";
import { openMarketDialog } from "./dialogs/MarketDialog";
import { openRenewalDialog } from "@/components/fc/RenewalDialog";
import "./Terminal.scss";

interface Operation {
  title: string;
  icon: ComponentType;
  noConfirm?: boolean;
  danger?: boolean;
  className?: string;
  click: () => void | Promise<void>;
  condition?: () => boolean;
}

export default function Terminal({ card }: { card: LayoutCard }) {
  const { modal } = App.useApp();
  const { isPhone } = useScreen();
  const allowUsePreset = useAppState((s) => s.settings.allowUsePreset);
  const isAdmin = useIsAdmin();
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const instanceId = getMetaOrRouteValue("instanceId") ?? "";
  const daemonId = getMetaOrRouteValue("daemonId") ?? "";
  const viewType = getMetaOrRouteValue("viewType", false);
  const innerTerminalType = card.width === 12 && viewType === "inner";

  const terminal = useTerminal();
  const { session, state: instanceInfo, isStopped, isRunning, isBuys, isGlobalTerminal } = terminal;
  const [isOpenLoading, setOpenLoading] = useState(false);
  const crashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(crashTimer.current), []);

  const instanceTypeText = instanceTypeTranslation()[instanceInfo?.config.type ?? ""];
  const instanceStatusText = instanceInfo ? instanceStatusLabels()[instanceInfo.status as INSTANCE_STATUS_CODE] : "";
  const instanceName = instanceInfo?.config.nickname === GLOBAL_INSTANCE_NAME ? t("TXT_CODE_5bdaf23d") : instanceInfo?.config.nickname;
  const params = { params: { uuid: instanceId, daemonId } };

  const toOpenInstance = async () => {
    clearTimeout(crashTimer.current);
    session?.clearTerminal();
    setOpenLoading(true);
    try {
      if (instanceInfo?.config?.type?.startsWith("minecraft/java")) {
        if (!(await verifyEULA(instanceId, daemonId, modal))) return;
        await sleep(1000);
      }
      await openInstance(params);
      // If the instance is still stopped shortly after starting, it crashed.
      crashTimer.current = setTimeout(() => {
        if (!session?.isStopped) return;
        const config = session.state?.config;
        modal.error({
          title: t("TXT_CODE_ac405b50"),
          content: (
            <div>
              <p>{t("TXT_CODE_3409258a")}</p>
              <p>{`${t("TXT_CODE_973414e1")}：${config?.startCommand || ""}`}</p>
              {config?.processType === "docker" && <p>{`${t("TXT_CODE_44b585c7")}：${config?.docker?.image || ""}`}</p>}
            </div>
          )
        });
      }, INSTANCE_CRASH_TIMEOUT);
    } catch (error) {
      reportErrorMsg(error);
    } finally {
      setOpenLoading(false);
    }
  };

  const run = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (error) {
      reportErrorMsg(error);
    }
  };

  const quickOperations = arrayFilter<Operation>([
    { title: t("TXT_CODE_57245e94"), icon: PlayCircleOutlined, className: "button-color-success", click: toOpenInstance, condition: () => isStopped },
    { title: t("TXT_CODE_b1dedda3"), icon: PauseCircleOutlined, danger: true, click: run(() => stopInstance(params)), condition: () => isRunning }
  ]);
  const instanceOperations = arrayFilter<Operation>([
    { title: t("TXT_CODE_47dcfa5"), icon: RedoOutlined, click: run(() => restartInstance(params)), condition: () => isRunning },
    { title: t("TXT_CODE_7b67813a"), icon: CloseOutlined, danger: true, className: "color-warning", click: run(() => killInstance(params)), condition: () => !isStopped },
    {
      title: t("TXT_CODE_40ca4f2"),
      icon: CloudDownloadOutlined,
      click: run(async () => {
        session?.clearTerminal();
        await updateInstance({ params: { uuid: instanceId, daemonId, task_name: "update" }, data: { time: Date.now() } });
      }),
      condition: () => isStopped && !!instanceInfo?.config.updateCommand
    },
    {
      title: t("TXT_CODE_b19ed1dd"),
      icon: InteractionOutlined,
      noConfirm: true,
      click: () => {
        session?.clearTerminal();
        void openMarketDialog(daemonId ?? "", instanceId ?? "", { autoInstall: true, onlyDockerTemplate: instanceInfo?.config?.processType === "docker" });
      },
      condition: () => isStopped && (allowUsePreset || isAdmin) && !isGlobalTerminal
    },
    {
      title: t("TXT_CODE_f77093c8"),
      icon: MoneyCollectOutlined,
      noConfirm: true,
      click: () => void openRenewalDialog(instanceInfo?.instanceUuid ?? "", daemonId ?? "", instanceInfo?.config?.category ?? 0),
      condition: () => !!instanceInfo?.config?.category
    }
  ]);
  const allOperations = [...quickOperations, ...instanceOperations];

  const statusTag = (showUnknown: boolean) =>
    isRunning ? (
      <Tag color="green">
        <CheckCircleOutlined /> {instanceStatusText}
      </Tag>
    ) : isBuys ? (
      <Tag color="red">
        <LoadingOutlined /> {instanceStatusText}
      </Tag>
    ) : instanceStatusText || showUnknown ? (
      <Tag>
        <InfoCircleOutlined /> {instanceStatusText}
      </Tag>
    ) : null;

  const core = instanceId && daemonId && <TerminalCore terminal={terminal} instanceId={instanceId} daemonId={daemonId} height={card.height} />;
  const menuItems = (ops: Operation[]) =>
    ops.map((item) => ({
      key: item.title,
      label: (
        <span>
          <item.icon /> {item.title}
        </span>
      ),
      onClick: () => void item.click()
    }));

  if (innerTerminalType) {
    return (
      <div>
        <div className="mb-24">
          <BetweenMenus
            left={
              <div className="align-center instance-terminal-head">
                <Typography.Title className="mb-0 mr-12" level={4}>
                  <CloudServerOutlined />
                  <span className="ml-6">{instanceName}</span>
                </Typography.Title>
                {!isPhone && (
                  <Typography.Paragraph className="mb-0 ml-4">
                    <span className="ml-6">{statusTag(false)}</span>
                    {instanceTypeText && <Tag color="purple"> {instanceTypeText} </Tag>}
                    {!!instanceInfo?.watcher && instanceInfo.watcher > 1 && (
                      <span className="ml-16">
                        <Tooltip title={t("TXT_CODE_4a37ec9c")}>
                          <LaptopOutlined />
                        </Tooltip>
                        <span className="ml-6" style={{ opacity: 0.8 }}>
                          {instanceInfo.watcher}
                        </span>
                      </span>
                    )}
                  </Typography.Paragraph>
                )}
              </div>
            }
            right={
              !isPhone ? (
                <div className="instance-terminal-ops">
                  {allOperations.map((item) =>
                    item.noConfirm ? (
                      <Button key={item.title} className={item.className} danger={item.danger} disabled={isOpenLoading} onClick={() => void item.click()}>
                        <item.icon /> {item.title}
                      </Button>
                    ) : (
                      <Popconfirm key={item.title} title={t("TXT_CODE_276756b2")} onConfirm={() => void item.click()}>
                        <Button className={item.className} danger={item.danger} loading={item.icon === PlayCircleOutlined && isOpenLoading}>
                          <item.icon /> {item.title}
                        </Button>
                      </Popconfirm>
                    )
                  )}
                </div>
              ) : (
                <Dropdown menu={{ items: menuItems(allOperations) }}>
                  <Button type="primary">
                    {t("TXT_CODE_fe731dfc")} <DownOutlined />
                  </Button>
                </Dropdown>
              )
            }
          />
        </div>
        <div className="mb-10 justify-end">
          <TerminalTopTags info={instanceInfo?.info} isStopped={isStopped} />
        </div>
        {core}
      </div>
    );
  }

  return (
    <CardPanel
      className="containerWrapper"
      style={{ height: "100%" }}
      title={
        <>
          <CloudServerOutlined />
          <span className="ml-8"> {instanceName} </span>
          <span className="ml-8">
            {statusTag(true)}
            <Tag color="purple"> {instanceTypeText} </Tag>
          </span>
        </>
      }
      operator={
        <>
          {quickOperations.map((item) => (
            <span key={item.title} className="mr-2">
              <IconBtn icon={item.icon} title={item.title} onClick={() => void item.click()} />
            </span>
          ))}
          <Dropdown menu={{ items: menuItems(instanceOperations) }}>
            <span>
              <IconBtn icon={DownOutlined} title={t("TXT_CODE_fe731dfc")} />
            </span>
          </Dropdown>
        </>
      }
    >
      <div className="mb-6">
        <TerminalTopTags info={instanceInfo?.info} isStopped={isStopped} />
      </div>
      {core}
    </CardPanel>
  );
}
