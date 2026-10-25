/** Port of PanelOverview.vue (layout type "DataOverview"): panel host facts. */
import {
  ApiOutlined, AppstoreOutlined, ClockCircleOutlined, CloudServerOutlined, CodeOutlined, DatabaseOutlined,
  DesktopOutlined, GlobalOutlined, LaptopOutlined, LockOutlined, SafetyCertificateOutlined, ThunderboltOutlined, UserOutlined
} from "@ant-design/icons";
import { Col, Row, Tag } from "antd";
import type { ComponentType } from "react";
import CardPanel from "@/components/CardPanel";
import DataStatistic from "@/components/DataStatistic";
import type { WidgetProps } from "@/config/widgets";
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { t } from "@/lang/i18n";
import "./DataOverview.scss";

type Item =
  | { type: "text"; title: string; value: string; icon?: ComponentType<{ className?: string }> }
  | { type: "memory"; title: string; used: number; total: number }
  | { type: "cpu"; title: string; percent: number }
  | { type: "loadavg"; title: string; values: number[] };

export default function DataOverview({ card }: WidgetProps) {
  const { state } = useOverviewInfo();
  let items: Item[];
  if (!state) {
    items = [{ type: "text", title: t("TXT_CODE_b197be11"), value: "" }];
  } else {
    const { system, version, record, specifiedDaemonVersion, process } = state;
    const free = Number((system.freemem / 1024 / 1024 / 1024).toFixed(1));
    const totalMem = Number((system.totalmem / 1024 / 1024 / 1024).toFixed(1));
    const usedMem = totalMem - free;
    items = [
      { type: "text", title: t("TXT_CODE_413b9c01"), value: system.node, icon: CodeOutlined },
      { type: "text", title: t("TXT_CODE_af21e6b"), value: version, icon: AppstoreOutlined },
      { type: "text", title: t("TXT_CODE_a0e70887"), value: specifiedDaemonVersion, icon: ApiOutlined },
      { type: "text", title: t("TXT_CODE_fdb6c369"), value: system.user?.username ?? "", icon: UserOutlined },
      { type: "text", title: t("TXT_CODE_f54e6d1f"), value: new Date(system.time).toLocaleString(), icon: ClockCircleOutlined },
      { type: "text", title: t("TXT_CODE_4ab6a0b5"), value: new Date().toLocaleString(), icon: GlobalOutlined },
      { type: "text", title: t("TXT_CODE_856bd2f3"), value: String(record.banips), icon: SafetyCertificateOutlined },
      { type: "text", title: t("TXT_CODE_da8f97a7"), value: String(record.illegalAccess), icon: LockOutlined },
      { type: "memory", title: t("TXT_CODE_593ee330"), used: usedMem, total: totalMem },
      { type: "cpu", title: "CPU", percent: Math.min(100, Math.round(state.cpu ?? 0)) },
      ...(!system.type.toLowerCase().includes("windows")
        ? [{ type: "loadavg" as const, title: t("TXT_CODE_190ecd56"), values: system.loadavg.map((v) => Number(Number(v).toFixed(2))) }]
        : []),
      { type: "text", title: t("TXT_CODE_77d038f7"), value: `${(process.memory / 1024 / 1024).toFixed(1)}MB`, icon: DesktopOutlined },
      { type: "text", title: t("TXT_CODE_4df7e9bd"), value: system.hostname, icon: CloudServerOutlined },
      { type: "text", title: t("TXT_CODE_b4d8588"), value: `${system.version.length > 16 ? system.version.slice(0, 16) + "..." : system.version} ${system.release}`, icon: CodeOutlined },
      { type: "text", title: t("TXT_CODE_edf84830"), value: `${system.type} ${system.platform}`, icon: LaptopOutlined }
    ];
  }

  return (
    <div className="panel-overview">
      <CardPanel title={card.title} style={{ height: "100%" }}>
        <Row gutter={[24, 24]}>
          {items.map((item, i) => (
            <Col key={`${item.title}-${i}`} span={12} md={12} lg={6}>
              {item.type === "memory" ? (
                <div className="overview-item overview-item--progress">
                  <div className="overview-item__title">
                    <DatabaseOutlined className="overview-item__icon" />
                    <span style={{ opacity: 0.7 }}>{item.title}</span>
                  </div>
                  <div className="overview-item__value">
                    <span className="overview-item__percent">{item.total > 0 ? Math.round((item.used / item.total) * 100) : 0}%</span>
                    <span className="overview-item__unit">
                      {item.used.toFixed(1)} GB / {item.total.toFixed(1)} GB
                    </span>
                  </div>
                </div>
              ) : item.type === "cpu" ? (
                <div className="overview-item overview-item--progress">
                  <div className="overview-item__title">
                    <ThunderboltOutlined className="overview-item__icon" />
                    <span style={{ opacity: 0.7 }}>{item.title}</span>
                  </div>
                  <div className="overview-item__value">
                    <span className="overview-item__percent">{item.percent}%</span>
                  </div>
                </div>
              ) : item.type === "loadavg" ? (
                <div className="overview-item overview-item--loadavg">
                  <div className="overview-item__title">
                    <ThunderboltOutlined className="overview-item__icon" />
                    <span style={{ opacity: 0.7 }}>{item.title}</span>
                  </div>
                  <div className="loadavg-tags">
                    {item.values.map((v, j) => (
                      <span key={j} style={{ display: "contents" }}>
                        <Tag color={j === 0 ? "green" : j === 1 ? "gold" : "volcano"} className="loadavg-tag">
                          {v.toFixed(2)}
                        </Tag>
                        {j < item.values.length - 1 && <span className="loadavg-sep">·</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <DataStatistic title={item.title} value={item.value} icon={item.icon} />
              )}
            </Col>
          ))}
        </Row>
      </CardPanel>
    </div>
  );
}
