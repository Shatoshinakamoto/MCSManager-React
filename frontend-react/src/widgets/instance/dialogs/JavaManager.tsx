/**
 * Java runtimes on the daemon: list, add a local path, download, choose for
 * this instance, delete (port of dialogs/JavaManager.vue).
 * Fix over upstream: "added" is only reported when the add request succeeded.
 */
import { DeleteOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { App, Button, Modal, Popconfirm, Table, Typography, type TableColumnsType } from "antd";
import { useEffect, useState } from "react";
import { openAddJavaDialog, openDownloadJavaDialog } from "@/components/fc/JavaDialogs";
import { t } from "@/lang/i18n";
import { addJava, deleteJava, downloadJava, getJavaList, usingJava } from "@/services/apis/javaManager";
import { openDialog } from "@/stores/dialogHost";
import { parseTimestamp } from "@/tools/time";
import type { InstanceDetail } from "@/types/instance";
import type { JavaInfo, JavaRuntime } from "@/types/javaManager";

interface Props {
  info: InstanceDetail;
  instanceId: string;
  daemonId: string;
  done: (changed: boolean) => void;
}

function JavaManager({ info, instanceId, daemonId, done }: Props) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(true);
  const [list, setList] = useState<JavaRuntime[]>([]);
  const [usingId, setUsingId] = useState(info.config.java?.id ?? "");
  const [changed, setChanged] = useState(false);
  const params = { daemonId, instanceId };

  const errorText = (err: unknown) => void message.error(err instanceof Error ? err.message : String(err));
  const refresh = async (notify = false) => {
    try {
      setList((await getJavaList({ params, forceRequest: true })) ?? []);
      if (notify) message.success(t("TXT_CODE_fbde647e"));
    } catch (err) {
      errorText(err);
    }
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setOpen(false);
    done(changed);
  };

  const handleDownload = async () => {
    const data = await openDownloadJavaDialog();
    if (!data) return;
    try {
      await downloadJava({ params, data: { name: data.name, version: data.version } });
      message.success(t("TXT_CODE_5e7a4c02"));
    } catch (err) {
      errorText(err);
    }
    await refresh();
  };
  const handleAdd = async () => {
    const data = await openAddJavaDialog();
    if (!data) return;
    try {
      await addJava({ params: { daemonId }, data: { name: data.name, path: data.path } });
      message.success(t("TXT_CODE_10f0f8d"));
    } catch (err) {
      errorText(err);
    }
    await refresh();
  };
  const handleDelete = async (j: JavaInfo) => {
    try {
      await deleteJava({ params, data: { id: j.fullname } });
    } catch (err) {
      errorText(err);
    }
    await refresh();
  };
  const handleUse = async (j: JavaInfo) => {
    try {
      await usingJava({ params, data: { id: j.fullname } });
      setUsingId(j.fullname);
      setChanged(true);
      message.success(t("TXT_CODE_d3de39b4"));
    } catch (err) {
      errorText(err);
    }
    await refresh();
  };

  const columns: TableColumnsType<JavaRuntime> = [
    { align: "center", title: t("TXT_CODE_151d2bb7"), dataIndex: ["info", "fullname"], key: "fullname" },
    { align: "center", title: t("TXT_CODE_a2e79565"), dataIndex: ["info", "installTime"], key: "installTime", render: (v: number) => parseTimestamp(v) },
    {
      align: "center",
      title: t("TXT_CODE_759fb403"),
      key: "status",
      render: (_, r) => (r.usingInstances.length > 0 ? t("TXT_CODE_bdb620b9") : r.info.downloading ? t("TXT_CODE_d919f7c7") : t("TXT_CODE_15f2e564"))
    },
    {
      align: "center",
      title: t("TXT_CODE_fe731dfc"),
      key: "actions",
      width: 250,
      render: (_, r) => (
        <div className="flex justify-end">
          {r.info.fullname === usingId ? (
            <Button className="mr-8" type="link" disabled>
              {t("TXT_CODE_979520ef")}
            </Button>
          ) : (
            <Button className="mr-8" type="link" disabled={r.info.downloading} onClick={() => void handleUse(r.info)}>
              {t("TXT_CODE_f0dcc8bf")}
            </Button>
          )}
          <Popconfirm title={t("TXT_CODE_f4f86ba8")} description={t("TXT_CODE_35631d1d")} onConfirm={() => void handleDelete(r.info)}>
            <Button danger type="link" disabled={r.info.downloading}>
              {t("TXT_CODE_ecbd7449")} <DeleteOutlined />
            </Button>
          </Popconfirm>
        </div>
      )
    }
  ];

  return (
    <Modal
      open={open}
      width={1000}
      centered
      title={t("TXT_CODE_3fee13ed")}
      onCancel={close}
      footer={
        <Button type="primary" onClick={close}>
          {t("TXT_CODE_31e92ef3")}
        </Button>
      }
    >
      <Typography.Paragraph>
        <Typography.Text type="secondary">
          {t("TXT_CODE_ebf01bcc")}
          <br />
          {t("TXT_CODE_e1c637bb").replace("<mcsm_java>", "{mcsm_java}")}
        </Typography.Text>
      </Typography.Paragraph>
      <div className="items-right">
        <Button type="link" icon={<PlusOutlined />} onClick={() => void handleAdd()}>
          {t("TXT_CODE_8900e7ee")}
        </Button>
        <Button type="link" icon={<DownloadOutlined />} onClick={() => void handleDownload()}>
          {t("TXT_CODE_9c48100e")}
        </Button>
        <Button icon={<ReloadOutlined />} type="text" onClick={() => void refresh(true)}>
          {t("TXT_CODE_b76d94e0")}
        </Button>
      </div>
      <Table
        className="mt-12"
        rowKey={(r) => r.info.fullname}
        dataSource={list}
        columns={columns}
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 15, size: "middle" }}
      />
    </Modal>
  );
}

export const openJavaManagerDialog = (info: InstanceDetail, instanceId: string, daemonId: string) =>
  openDialog<boolean>((done) => <JavaManager info={info} instanceId={instanceId} daemonId={daemonId} done={done} />);
