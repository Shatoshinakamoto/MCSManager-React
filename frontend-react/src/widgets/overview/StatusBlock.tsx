/** Port of StatusBlock.vue: one dashboard stat chosen by card.meta.type. */
import { AppstoreOutlined, FlagOutlined, HddOutlined, NodeExpandOutlined } from "@ant-design/icons";
import { Progress, Typography } from "antd";
import type { CSSProperties, ReactNode } from "react";
import CardPanel from "@/components/CardPanel";
import type { WidgetProps } from "@/config/widgets";
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { t } from "@/lang/i18n";
import { getProgressStrokeColor } from "@/tools/progressColor";
import "./StatusBlock.scss";

const breakInNeed = (a: number, b = 0): CSSProperties | undefined => ((a > b ? a : b) >= 10000 ? { display: "block" } : undefined);

function Ratio({ a, b, total }: { a: number; b: number; total?: number }) {
  return (
    <div className="status-text">
      <span className="status-text__highlight" style={breakInNeed(total ?? a, total === undefined ? b : 0)}>
        {a}
      </span>{" "}
      / {b}
    </div>
  );
}

export default function StatusBlock({ card }: WidgetProps) {
  const { state: s } = useOverviewInfo();
  const type = card.meta?.type as string | undefined;

  let title = "";
  let body: ReactNode = null;
  let Icon: typeof HddOutlined | null = null;

  if (s) {
    if (type === "node") {
      title = t("TXT_CODE_4b7eba50");
      Icon = NodeExpandOutlined;
      const total = s.remoteCount?.total ?? 0;
      body = <Ratio a={s.remoteCount?.available ?? 0} b={total} total={total} />;
    } else if (type === "instance") {
      title = t("TXT_CODE_8201d2c6");
      Icon = AppstoreOutlined;
      const pct = s.totalInstance ? Math.round((s.runningInstance / s.totalInstance) * 100) : 0;
      body = (
        <>
          <div className="mb-10">
            <Ratio a={s.runningInstance} b={s.totalInstance} total={s.totalInstance} />
          </div>
          <Progress percent={pct} strokeColor={getProgressStrokeColor(pct)} showInfo={false} size={{ height: 12 }} style={{ maxWidth: "60%" }} />
        </>
      );
    } else if (type === "users") {
      title = t("TXT_CODE_871fb0d6");
      Icon = FlagOutlined;
      body = <Ratio a={s.record.loginFailed} b={s.record.logined} />;
    } else if (type === "system") {
      title = t("TXT_CODE_f4244bbf");
      const memUsedPercent = Math.round(100 - Number(s.mem));
      const memTotalGB = Number((s.system.totalmem / 1024 / 1024 / 1024).toFixed(1));
      const memUsedGB = Number((memTotalGB - s.system.freemem / 1024 / 1024 / 1024).toFixed(1));
      const bars = [
        { label: "CPU", percent: s.cpu, detail: undefined as string | undefined },
        { label: t("TXT_CODE_593ee330"), percent: memUsedPercent, detail: `${memUsedGB} GB / ${memTotalGB} GB` }
      ];
      body = (
        <div className="status-bars">
          {bars.map((bar) => (
            <div key={bar.label} className="status-bar-item">
              <div className="status-bar-label">
                <span>{bar.label}</span>
                <div className="status-bar-value">
                  <span className="status-bar-value__percent">{bar.percent}%</span>
                  {bar.detail && <span className="status-bar-value__detail">{bar.detail}</span>}
                </div>
              </div>
              <Progress percent={bar.percent} strokeColor={getProgressStrokeColor(bar.percent)} size={{ height: 12 }} showInfo={false} />
            </div>
          ))}
        </div>
      );
    }
  }

  return (
    <CardPanel className="StatusBlock" title={card.title} style={{ height: "100%" }}>
      <div className="status-header">
        <Typography.Text className="status-header__title color-info">{title}</Typography.Text>
      </div>
      {body}
      {Icon && <Icon className="status-card-icon" />}
    </CardPanel>
  );
}
