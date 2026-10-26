/**
 * User resources page (port of widgets/user/AccessSettings.vue): lists the
 * instances assigned to a user and lets an admin assign or remove them.
 *
 * The user is taken from the card meta or the ?uuid= query, like upstream.
 * Assigning a non-Docker instance shows the upstream warning that the user
 * could reach the host through it; the admin must tick the box to continue.
 *
 * When the user is linked to an OS account, assigning an instance hands its
 * folder over to that account on the node (docs/features/os-user-accounts.md);
 * the page says so, waits long enough for a large folder, and reloads the
 * stored list afterwards so a refused change never looks saved.
 *
 * Security: the panel enforces that only admins may change assignments; the
 * warning is a usability safeguard, not an access control.
 */
import { Alert, Button, Col, Popconfirm, Row, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import BetweenMenus from "@/components/BetweenMenus";
import CardPanel from "@/components/CardPanel";
import { openSelectInstances } from "@/components/fc/SelectInstances";
import { openWarningDialog } from "@/components/fc/WarningDialog";
import type { WidgetProps } from "@/config/widgets";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { osAccountWarnings, updateUserInstance, userInfoByUuid } from "@/services/apis/user";
import { message } from "@/tools/antdStatic";
import { reportErrorMsg } from "@/tools/validator";
import type { UserInstance } from "@/types";
import { instanceStatusLabels } from "@/types/instance";

export default function AccessSettings({ card }: WidgetProps) {
  const { isPhone } = useScreen();
  const navigate = useNavigate();
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const userUuid = getMetaOrRouteValue("uuid");
  const [rows, setRows] = useState<UserInstance[]>([]);
  const [osAccount, setOsAccount] = useState("");

  const refresh = useCallback(async () => {
    if (!userUuid) return;
    try {
      const info = await userInfoByUuid({ params: { uuid: userUuid, advanced: true }, forceRequest: true });
      if (info) {
        setRows([...info.instances]);
        setOsAccount(info.osAccount ?? "");
      }
    } catch (err) {
      reportErrorMsg(err);
    }
  }, [userUuid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (instances: UserInstance[]) => {
    try {
      // A linked account means the nodes hand folders over first (up to 15 minutes).
      const res = await updateUserInstance({ data: { config: { instances }, uuid: String(userUuid) }, timeout: osAccount ? 16 * 60_000 : undefined });
      message.success(t("TXT_CODE_d3de39b4"));
      for (const w of osAccountWarnings(res)) message.warning(w, 10);
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      void refresh();
    }
  };

  const remove = (target: UserInstance) => {
    const next = rows.filter((i) => !(i.daemonId === target.daemonId && i.instanceUuid === target.instanceUuid));
    setRows(next);
    void save(next);
  };

  const assign = async () => {
    const picked = await openSelectInstances(rows, () => navigate("/node"));
    if (!picked) return;
    const unsafe = picked.filter((i) => i.processType !== "docker").map((i) => String(i.nickname ?? ""));
    if (unsafe.length > 0) {
      const ok = await openWarningDialog({
        title: t("TXT_CODE_dd78943e"),
        subTitle: t("TXT_CODE_57e86edb") + unsafe.join(", "),
        checkText: t("TXT_CODE_19f697f3")
      });
      // Upstream rejected here, which skipped the save.
      if (!ok) return reportErrorMsg(t("TXT_CODE_1b7a8832"));
    }
    setRows(picked);
    await save(picked);
  };

  const statusLabels = instanceStatusLabels() as Record<string, string>;
  const columns: ColumnsType<UserInstance> = [
    ...(!isPhone
      ? [
          {
            align: "center" as const,
            title: t("TXT_CODE_b26a0528"),
            dataIndex: "remarks",
            key: "remarks",
            minWidth: 200,
            render: (_: unknown, r: UserInstance) => `${r.hostIp} (${r.remarks})`
          }
        ]
      : []),
    { align: "center", title: t("TXT_CODE_f70badb9"), dataIndex: "nickname", key: "name", minWidth: 200 },
    ...(!isPhone
      ? [
          {
            align: "center" as const,
            title: t("TXT_CODE_fa920c0"),
            dataIndex: "endTime",
            key: "endTime",
            minWidth: 200,
            render: (v: string | number) => {
              if (Number(v) === 0) return t("TXT_CODE_8dfd8b17");
              if (!isNaN(Number(v))) return dayjs(Number(v)).format("YYYY-MM-DD HH:mm:ss");
              return v;
            }
          },
          {
            align: "center" as const,
            title: t("TXT_CODE_3d602459"),
            dataIndex: "status",
            key: "status",
            minWidth: 200,
            render: (v: number) => statusLabels[String(v)] || v
          }
        ]
      : []),
    {
      align: "center",
      title: t("TXT_CODE_fe731dfc"),
      key: "operation",
      minWidth: 200,
      render: (_, record) => (
        <Popconfirm title={t("TXT_CODE_71155575")} onConfirm={() => remove(record)}>
          <Button danger size="large">
            {t("TXT_CODE_ecbd7449")}
          </Button>
        </Popconfirm>
      )
    }
  ];

  if (!userUuid) return null;
  return (
    <div style={{ height: "100%" }} className="container">
      <Row gutter={[24, 24]} style={{ height: "100%" }}>
        <Col span={24}>
          <BetweenMenus
            left={
              !isPhone && (
                <Typography.Title className="mb-0" level={4}>
                  {t("TXT_CODE_76d20724")}
                </Typography.Title>
              )
            }
            right={
              <>
                <Button onClick={() => void refresh()}>{t("TXT_CODE_b76d94e0")}</Button>
                <Button type="primary" onClick={() => void assign()}>
                  {t("TXT_CODE_9393b484")}
                </Button>
              </>
            }
          />
        </Col>
        {osAccount && (
          <Col span={24}>
            <Alert type="info" showIcon title={t("TXT_CODE_OSACCOUNT_ASSIGN_NOTICE", { account: osAccount })} />
          </Col>
        )}
        <Col span={24}>
          <CardPanel className="h-100">
            <Table<UserInstance>
              rowKey={(r) => `${r.daemonId}/${r.instanceUuid}`}
              scroll={{ x: "max-content" }}
              dataSource={rows}
              columns={columns}
              pagination={{ size: "middle" }}
            />
          </CardPanel>
        </Col>
      </Row>
    </div>
  );
}
