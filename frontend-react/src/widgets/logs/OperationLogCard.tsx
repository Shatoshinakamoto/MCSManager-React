/** Port of OperationLogCard.vue: latest sensitive operations as a timeline. */
import { Button, Timeline } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import CardPanel from "@/components/CardPanel";
import type { WidgetProps } from "@/config/widgets";
import { t } from "@/lang/i18n";
import { getOperationLog } from "@/services/apis";
import { formatLogs } from "@/tools/operationLog";
import "./OperationLogCard.scss";

export default function OperationLogCard({ card }: WidgetProps) {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ReturnType<typeof formatLogs>>([]);

  useEffect(() => {
    let alive = true;
    getOperationLog()
      .then((data) => alive && setLogs(formatLogs([...(data ?? [])].reverse())))
      .catch(() => alive && setLogs([]));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <CardPanel
      className="OperationLogCard"
      title={card.title}
      operator={
        <Button type="link" size="small" onClick={() => navigate("/audit")}>
          {t("TXT_CODE_ac4ad8b0")}
        </Button>
      }
    >
      <div className="time-line full-card-body-container scrollbar-hidden">
        {logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-text">{t("TXT_CODE_54469e02")}</div>
            <div className="empty-description">{t("TXT_CODE_73102f2b")}</div>
          </div>
        ) : (
          <Timeline
            items={logs.map((item, i) => ({
              key: i,
              color: item.color,
              content: (
                <div className="log-item">
                  <div className="log-content">{item.text}</div>
                  <div className="log-time">{dayjs(Number(item.operation_time)).format("YYYY-MM-DD HH:mm:ss")}</div>
                </div>
              )
            }))}
          />
        )}
      </div>
    </CardPanel>
  );
}
