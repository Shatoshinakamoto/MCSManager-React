/** "My instances" table for regular users (port of widgets/UserInstanceList.vue). */
import { Button, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useNavigate } from "react-router";
import CardPanel from "@/components/CardPanel";
import type { WidgetProps } from "@/config/widgets";
import { useUserInstances } from "@/hooks/useUserInstances";
import { t } from "@/lang/i18n";
import { parseTimestamp } from "@/tools/time";
import type { UserInstance } from "@/types";
import { INSTANCE_STATUS_CODE, instanceStatusLabels } from "@/types/instance";

export default function UserInstanceList({ card }: WidgetProps) {
  const navigate = useNavigate();
  const state = useUserInstances();

  const columns: ColumnsType<UserInstance> = [
    { title: t("TXT_CODE_f70badb9"), dataIndex: "nickname", key: "nickname" },
    {
      title: t("TXT_CODE_5476e012"),
      dataIndex: "status",
      key: "status",
      render: (v: INSTANCE_STATUS_CODE) => instanceStatusLabels()[v] || v
    },
    { title: t("TXT_CODE_5ab2062d"), dataIndex: "lastDatetime", key: "lastDatetime", render: (v: number) => parseTimestamp(v) },
    { title: t("TXT_CODE_fa920c0"), dataIndex: "endTime", key: "endTime", render: (v: number) => parseTimestamp(v) || t("TXT_CODE_abc080d") },
    {
      title: t("TXT_CODE_fe731dfc"),
      key: "operate",
      render: (_: unknown, record) => (
        <Button
          disabled={record.status === INSTANCE_STATUS_CODE.BUSY}
          onClick={() => navigate(`/instances/terminal?${new URLSearchParams({ daemonId: record.daemonId, instanceId: record.instanceUuid })}`)}
        >
          {t("TXT_CODE_aa43b248")}
        </Button>
      )
    }
  ];

  return (
    <CardPanel title={card.title}>
      <Table<UserInstance> dataSource={state?.instances} columns={columns} pagination={false} rowKey="instanceUuid" scroll={{ x: "max-content" }} />
    </CardPanel>
  );
}
