/**
 * Port of NodeItem.vue: one daemon card with details, actions and CPU/memory
 * charts. Used by NodeList and as the "NodeItem" layout card (meta.daemonId
 * or ?daemonId=).
 */
import {
  BlockOutlined, CheckCircleOutlined, CloudServerOutlined, CloudUploadOutlined, CodeOutlined,
  FolderOpenOutlined, InfoCircleOutlined, ReloadOutlined, SettingOutlined
} from "@ant-design/icons";
import { Col, Modal, Row, Tooltip, Typography } from "antd";
import { message } from "@/tools/antdStatic";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import CardPanel from "@/components/CardPanel";
import IconBtn from "@/components/IconBtn";
import NodeSimpleChart from "@/components/NodeSimpleChart";
import { GLOBAL_INSTANCE_UUID } from "@/config/const";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { getCurrentLang, t } from "@/lang/i18n";
import { connectNode, getDaemonUpgradeInfo, upgradeDaemon, type UpgradeInfo } from "@/services/apis/node";
import { pickLocalizedNotes } from "@/tools/localizedNotes";
import { hasVersionUpdate } from "@/tools/progressColor";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard } from "@/types";
import type { ComputedNode } from "@/types/overview";
import NodeDetailDialog, { type NodeDetailDialogHandle } from "./NodeDetailDialog";

interface Op {
  title: string;
  icon: ComponentType;
  click: (node: ComputedNode) => void;
  warning?: boolean;
  tooltip?: string;
}

function CardDaemonId({ card, onId }: { card: LayoutCard; onId: (id?: string) => void }) {
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const id = getMetaOrRouteValue("daemonId");
  useEffect(() => onId(id), [id, onId]);
  return null;
}

export default function NodeItem({ item, card }: { item?: ComputedNode; card?: LayoutCard }) {
  const dialog = useRef<NodeDetailDialogHandle>(null);
  const { state } = useOverviewInfo();
  const [cardDaemonId, setCardDaemonId] = useState<string>();
  const { toPage } = useAppRouters();
  const [upgrade, setUpgrade] = useState<UpgradeInfo>();

  const node = useMemo(() => state?.remote.find((n) => n.uuid === cardDaemonId) ?? item, [state, cardDaemonId, item]);
  const specified = state?.specifiedDaemonVersion;

  useEffect(() => {
    if (!node?.uuid || !node.available) return;
    let alive = true;
    getDaemonUpgradeInfo({ params: { uuid: node.uuid } })
      .then((r) => alive && setUpgrade(r))
      .catch(() => undefined); // keep the last known state, as upstream
    return () => {
      alive = false;
    };
  }, [node?.uuid, node?.available, node?.version]);

  const updateAvailable = Boolean(node?.available && upgrade?.updateAvailable);
  const notes = pickLocalizedNotes(upgrade?.onlineNotes, getCurrentLang());
  const updateTip = updateAvailable
    ? (() => {
        const tip = t("TXT_CODE_AUTOUPDATE_DAEMON_UPDATE_TIP", { v: upgrade?.onlineVersion ?? "" });
        return notes ? `${tip}\n${notes}` : tip;
      })()
    : undefined;

  const tryConnect = async (uuid: string) => {
    try {
      await connectNode({ params: { uuid } });
      message.success(t("TXT_CODE_7f0c746d"));
    } catch {
      reportErrorMsg(t("TXT_CODE_6a365d01"));
    }
  };

  const triggerUpdate = (uuid: string) => {
    Modal.confirm({
      title: t("TXT_CODE_AUTOUPDATE_DAEMON_BTN"),
      content: t("TXT_CODE_AUTOUPDATE_DAEMON_CONFIRM"),
      okText: t("TXT_CODE_AUTOUPDATE_BTN_OK"),
      cancelText: t("TXT_CODE_AUTOUPDATE_BTN_CANCEL"),
      onOk: async () => {
        try {
          const res = await upgradeDaemon({ params: { uuid } });
          if (res?.started) Modal.success({ content: t("TXT_CODE_AUTOUPDATE_DAEMON_STARTED", { v: res.onlineVersion }) });
          else message.info(res?.message || t("TXT_CODE_AUTOUPDATE_ALREADY_LATEST"));
        } catch (error) {
          reportErrorMsg((error as Error)?.message ? error : t("TXT_CODE_AUTOUPDATE_DAEMON_FAILED"));
        }
      }
    });
  };

  const ops: Op[] = !node
    ? []
    : [
        ...(node.available
          ? [
              { title: t("TXT_CODE_ae533703"), icon: FolderOpenOutlined, click: (n: ComputedNode) => toPage({ path: "/instances/terminal/files", query: { daemonId: n.uuid, instanceId: GLOBAL_INSTANCE_UUID } }) },
              { title: t("TXT_CODE_524e3036"), icon: CodeOutlined, click: (n: ComputedNode) => toPage({ path: "/instances/terminal", query: { daemonId: n.uuid, instanceId: GLOBAL_INSTANCE_UUID } }) },
              { title: t("TXT_CODE_e6c30866"), icon: BlockOutlined, click: (n: ComputedNode) => toPage({ path: "/node/image", query: { daemonId: n.uuid } }) },
              { title: t("TXT_CODE_AUTOUPDATE_DAEMON_BTN"), icon: CloudUploadOutlined, click: (n: ComputedNode) => triggerUpdate(n.uuid), warning: updateAvailable, tooltip: updateTip }
            ]
          : [{ title: t("TXT_CODE_f8b28901"), icon: ReloadOutlined, click: (n: ComputedNode) => void tryConnect(n.uuid) }]),
        { title: t("TXT_CODE_b5c7b82d"), icon: SettingOutlined, click: (n: ComputedNode) => dialog.current?.open(n) }
      ];

  const details = node
    ? [
        { title: t("TXT_CODE_f52079a0"), value: `${node.ip}:${node.port}` },
        { title: t("TXT_CODE_7c0b7608"), value: node.available ? t("TXT_CODE_823bfe63") : t("TXT_CODE_66ce073e"), warn: node.available === false, success: node.available === true, warnText: t("TXT_CODE_1c2efd38") },
        { title: t("TXT_CODE_3d602459"), value: node.instanceStatus },
        { title: t("TXT_CODE_3d0885c0"), value: node.platformText },
        {
          title: t("TXT_CODE_81634069"), value: node.version,
          success: !hasVersionUpdate(specified, node.version),
          warn: hasVersionUpdate(specified, node.version) && node.available,
          warnText: t("TXT_CODE_e520908a")
        },
        { title: "Daemon ID", value: node.uuid, onlyCopy: true }
      ]
    : [];

  return (
    <>
      {card && <CardDaemonId card={card} onId={setCardDaemonId} />}
      <div style={{ height: "100%" }} className="container">
        <CardPanel
          style={{ height: "100%" }}
          title={
            <div className="flex-center">
              <span className={node?.available ? undefined : "color-danger"}>
                <CloudServerOutlined /> {node?.remarks || node?.ip}
              </span>
            </div>
          }
          operator={
            node &&
            ops.map((op) => (
              <span key={op.title} className="mr-2">
                <IconBtn icon={op.icon} title={op.title} warning={op.warning} tooltip={op.tooltip} onClick={() => op.click(node)} />
              </span>
            ))
          }
        >
          {node && (
            <>
              <Row gutter={[24, 0]} className="mt-2">
                {details.map((d) => (
                  <Col key={d.title + d.value} span={6}>
                    <Typography.Paragraph>
                      <div title={d.onlyCopy ? d.value : ""}>{d.title}</div>
                      {d.onlyCopy ? (
                        <div>
                          <Typography.Text copyable={{ text: d.value ?? "" }} />
                        </div>
                      ) : (
                        <div style={{ fontSize: 13 }}>
                          {d.warn && d.value ? (
                            <Tooltip title={d.warnText}>
                              <span className="color-danger">
                                <InfoCircleOutlined /> {d.value}
                              </span>
                            </Tooltip>
                          ) : d.success ? (
                            <span className="color-success">
                              <CheckCircleOutlined /> {d.value}
                            </span>
                          ) : (
                            <span style={{ whiteSpace: "pre-wrap" }}>{String(d.value ?? "").trim() ? d.value : "--"}</span>
                          )}
                        </div>
                      )}
                    </Typography.Paragraph>
                  </Col>
                ))}
              </Row>
              <NodeSimpleChart className="mt-8" cpuUsage={node.cpuInfo ?? ""} memUsage={node.memText ?? ""} cpuData={node.cpuChartData ?? []} memData={node.memChartData ?? []} />
            </>
          )}
        </CardPanel>
      </div>
      <NodeDetailDialog ref={dialog} />
    </>
  );
}
