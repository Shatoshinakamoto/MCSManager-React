/** Scheduled tasks card for one instance (port of widgets/instance/Schedule.vue). */
import { DeleteOutlined, EditOutlined, FieldTimeOutlined } from "@ant-design/icons";
import { App, Button, Col, Popconfirm, Row, Spin, Table, Typography, type TableColumnsType } from "antd";
import { useEffect } from "react";
import BetweenMenus from "@/components/BetweenMenus";
import CardPanel from "@/components/CardPanel";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useSchedule } from "@/hooks/useSchedule";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { padZero } from "@/tools/common";
import type { LayoutCard } from "@/types";
import { ScheduleCreateType, scheduleActionTypeLabels, scheduleTypeLabels, type Schedule as ScheduleItem } from "@/types/schedule";
import { openNewScheduleDialog } from "./dialogs/NewSchedule";

/** Human-readable schedule time (same text as upstream timeRender). */
function timeRender(text: string, schedule: ScheduleItem): string {
  if (schedule.type === ScheduleCreateType.INTERVAL) {
    const time = Number(text);
    const h = padZero(Math.floor(time / 3600).toString());
    const m = padZero(Math.floor((time % 3600) / 60).toString());
    const s = padZero((time % 60).toString());
    return `${t("TXT_CODE_ec6d29f4")} ${h} ${t("TXT_CODE_e3db239d")} ${m} ${t("TXT_CODE_3b1bb444")} ${s} ${t("TXT_CODE_acabc771")}`;
  }
  if (schedule.type === ScheduleCreateType.CYCLE) {
    const [s, m, h, , , w] = text.split(" ");
    return `${t("TXT_CODE_76750199")} ${w} / ${padZero(h)}:${padZero(m)}:${padZero(s)}`;
  }
  if (schedule.type === ScheduleCreateType.SPECIFY) {
    const [s, m, h, dd, mm] = text.split(" ");
    return `${mm}/${dd} ${padZero(h)}:${padZero(m)}:${padZero(s)}`;
  }
  return "Unknown Time";
}

export default function Schedule({ card }: { card: LayoutCard }) {
  const { isPhone } = useScreen();
  const { message } = App.useApp();
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const instanceId = getMetaOrRouteValue("instanceId") ?? "";
  const daemonId = getMetaOrRouteValue("daemonId") ?? "";
  const { toPage } = useAppRouters();
  const { schedules, loading, getScheduleList, deleteSchedule } = useSchedule(instanceId, daemonId);

  useEffect(() => {
    void getScheduleList();
  }, [getScheduleList]);

  const openEditor = async (task?: ScheduleItem) => {
    if (await openNewScheduleDialog(instanceId, daemonId, task)) await getScheduleList();
  };

  const actionLabels = scheduleActionTypeLabels();
  const typeLabels = scheduleTypeLabels();

  const columns: TableColumnsType<ScheduleItem> = [
    { align: "center", title: t("TXT_CODE_2d542e4c"), dataIndex: "name", key: "name" },
    { align: "center", title: t("TXT_CODE_1544562"), dataIndex: "payload", key: "payload" },
    { align: "center", title: t("TXT_CODE_485e2d41"), dataIndex: "count", key: "count", render: (v: number) => (v > 0 ? v : t("TXT_CODE_a92df201")) },
    { align: "center", title: t("TXT_CODE_82fbc5ad"), dataIndex: "action", key: "action", render: (v: string) => actionLabels[v] },
    { align: "center", title: t("TXT_CODE_67d68dd1"), dataIndex: "type", key: "type", render: (v: number) => typeLabels[v] },
    { align: "center", title: t("TXT_CODE_3554dac0"), dataIndex: "time", key: "time", render: (v: string, record) => timeRender(v, record) },
    {
      align: "center",
      title: t("TXT_CODE_fe731dfc"),
      key: "actions",
      render: (_: unknown, record) => (
        <>
          <Button className="mr-8" size="large" onClick={() => void openEditor(record)}>
            {t("TXT_CODE_ad207008")}
            <EditOutlined />
          </Button>
          <Popconfirm title={t("TXT_CODE_6ff0668f")} onConfirm={() => deleteSchedule(record.name)}>
            <Button danger size="large">
              {t("TXT_CODE_ecbd7449")}
              <DeleteOutlined />
            </Button>
          </Popconfirm>
        </>
      )
    }
  ];

  const refresh = async () => {
    await getScheduleList();
    message.success(t("TXT_CODE_fbde647e"));
  };

  return (
    <div style={{ height: "100%" }} className="container">
      <Row gutter={[24, 24]} style={{ height: "100%" }}>
        <Col span={24}>
          <BetweenMenus
            left={
              !isPhone && (
                <Typography.Title className="mb-0" level={4}>
                  <FieldTimeOutlined /> {card.title}
                </Typography.Title>
              )
            }
            right={
              <>
                <Button onClick={() => toPage({ path: "/instances/terminal", query: { daemonId, instanceId } })}>{t("TXT_CODE_c14b2ea3")}</Button>
                <Button onClick={() => void refresh()}>{t("TXT_CODE_b76d94e0")}</Button>
                <Button type="primary" onClick={() => void openEditor()}>
                  {t("TXT_CODE_1644b775")}
                </Button>
              </>
            }
          />
        </Col>
        <Col span={24}>
          <CardPanel style={{ height: "100%" }}>
            <Spin spinning={loading}>
              <Table<ScheduleItem> rowKey="name" dataSource={schedules} columns={columns} scroll={{ x: "max-content" }} pagination={{ pageSize: 15, size: "middle" }} />
            </Spin>
          </CardPanel>
        </Col>
      </Row>
    </div>
  );
}
