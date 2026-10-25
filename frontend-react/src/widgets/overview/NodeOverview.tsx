/** Port of NodeOverview.vue: node table with CPU, memory, instances, version and status. */
import { CheckCircleOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import CardPanel from "@/components/CardPanel";
import type { WidgetProps } from "@/config/widgets";
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { t } from "@/lang/i18n";
import { getUsageColor, hasVersionUpdate } from "@/tools/progressColor";
import "./NodeOverview.scss";

interface Row {
  key: string;
  address: string;
  remark: string;
  cpu: string;
  cpuPercent?: number;
  mem: string;
  memUsedPercent?: number;
  running: number;
  total: number;
  version: string;
  status: string;
  available: boolean;
}

export default function NodeOverview({ card }: WidgetProps) {
  const { state } = useOverviewInfo();
  const specified = state?.specifiedDaemonVersion;

  const data: Row[] = useMemo(
    () =>
      (state?.remote ?? []).map((v) => {
        const totalMem = v.system?.totalmem ?? 0;
        const freeMem = v.system?.freemem ?? 0;
        return {
          key: v.uuid,
          address: `${v.ip}:${v.port}`,
          remark: v.remarks || "--",
          cpu: v.cpuInfo ?? "--",
          cpuPercent: v.system ? Number((v.system.cpuUsage * 100).toFixed(0)) : undefined,
          mem: v.memText ?? "--",
          memUsedPercent: totalMem > 0 ? Math.round((1 - freeMem / totalMem) * 100) : undefined,
          running: v.instance?.running ?? 0,
          total: v.instance?.total ?? 0,
          version: v.version || "--",
          status: v.available ? t("TXT_CODE_823bfe63") : t("TXT_CODE_66ce073e"),
          available: v.available
        };
      }),
    [state]
  );

  const columns: ColumnsType<Row> = [
    { title: `${t("TXT_CODE_c7d0002e")}:${t("TXT_CODE_f49149d0")}`, dataIndex: "address", key: "address", width: 140, render: (v) => <span className="text-monospace">{v}</span> },
    { title: t("TXT_CODE_3c8fd4c2"), dataIndex: "remark", key: "remark", width: 100 },
    {
      title: "CPU", dataIndex: "cpu", key: "cpu", width: 72,
      render: (_, r) => (r.available ? <span className="text-monospace" style={{ color: getUsageColor(r.cpuPercent ?? 0) }}>{r.cpu}</span> : "--")
    },
    {
      title: t("TXT_CODE_593ee330"), dataIndex: "mem", key: "mem", width: 72,
      render: (_, r) => (r.available ? <span style={{ color: getUsageColor(r.memUsedPercent ?? 0, "var(--color-purple-8)") }}>{r.mem}</span> : "--")
    },
    { title: t("TXT_CODE_eaed6901"), key: "instances", width: 90, render: (_, r) => `${r.running} / ${r.total}` },
    {
      title: t("TXT_CODE_3f99f17f"), dataIndex: "version", key: "version", width: 100,
      render: (_, r) => {
        if (r.available && hasVersionUpdate(specified, r.version)) {
          return (
            <Tooltip title={t("TXT_CODE_e520908a")}>
              <span className="color-danger"><InfoCircleOutlined className="mr-2" /> {r.version}</span>
            </Tooltip>
          );
        }
        if (r.available) return <span className="color-success"><CheckCircleOutlined className="mr-2" /> {r.version}</span>;
        return r.version;
      }
    },
    { title: t("TXT_CODE_f80e0786"), dataIndex: "status", key: "status", width: 90, render: (_, r) => <Tag color={r.available ? "green" : ""}>{r.status}</Tag> }
  ];

  const pagination = data.length <= 8 ? false : { pageSize: 8, showSizeChanger: false, showTotal: (n: number) => t("TXT_CODE_TOTAL_ITEMS", { total: n }), size: "small" as const };

  return (
    <CardPanel className="NodeOverview" title={card.title} style={{ height: "100%" }}>
      <div className="NodeOverview__wrap" style={{ height: card.height }}>
        <Table<Row> scroll={{ x: "max-content" }} columns={columns} dataSource={data} pagination={pagination} size="small" />
      </div>
    </CardPanel>
  );
}
