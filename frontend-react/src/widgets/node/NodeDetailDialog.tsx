/**
 * Port of NodeDetailDialog.vue: add or edit a daemon connection.
 * Opened imperatively through the returned `open(node?)` handle.
 *
 * SECURITY: the daemon key field is never pre-filled when editing (the panel
 * doesn't return it); leaving it empty keeps the stored key.
 */
import { Button, Card, Col, Form, Input, Modal, Popconfirm, Row, Select, Switch, Tabs, Tooltip, Typography } from "antd";
import { message } from "@/tools/antdStatic";
import { forwardRef, useImperativeHandle, useState } from "react";
import { addNode, deleteNode, updateNode } from "@/hooks/useRemoteNode";
import { t } from "@/lang/i18n";
import { getValidatorErrorMsg, isLocalNetworkIP, reportErrorMsg } from "@/tools/validator";
import type { ComputedNode, RemoteMapping } from "@/types/overview";
import NodeRemoteMappingEdit from "./NodeRemoteMappingEdit";

type Data = {
  ip: string; port: number | string; prefix: string; remarks: string; apiKey: string; language: string;
  uploadSpeedRate: number; downloadSpeedRate: number; maxDownloadFromUrlFileCount: number | string;
  portRangeStart: number; portRangeEnd: number; portAssignInterval: number; daemonPort: number | string;
  remoteMappings: RemoteMapping[]; outputBufferSize: number | string; enableSoftShutdown: boolean;
  softShutdownSkipDocker: boolean; softShutdownWaitSeconds: number | string;
};

const DEFAULT_CONFIG = (): Data => ({
  ip: "", port: 24444, prefix: "", remarks: "Unnamed Node", apiKey: "", language: "",
  uploadSpeedRate: 0, downloadSpeedRate: 0, maxDownloadFromUrlFileCount: 1, portRangeStart: 0, portRangeEnd: 0,
  portAssignInterval: 0, daemonPort: 24444, remoteMappings: [], outputBufferSize: 256, enableSoftShutdown: true,
  softShutdownSkipDocker: true, softShutdownWaitSeconds: 10
});

const SPEED_RATE_OPTIONS = () => [
  { label: t("TXT_CODE_e3a77a77"), value: 0 },
  ...([[5, "320KB/s"], [10, "640KB/s"], [16, "1MB/s"], [32, "2MB/s"], [64, "4MB/s"], [96, "6MB/s"], [128, "8MB/s"], [160, "10MB/s"], [240, "15MB/s"], [320, "20MB/s"], [480, "30MB/s"]] as const).map(
    ([value, label]) => ({ label, value })
  )
];

const ipNeedsMapping = (ip: string) => !!ip && ip.trim() !== "localhost" && isLocalNetworkIP(ip);

export interface NodeDetailDialogHandle {
  open: (node?: ComputedNode) => void;
}

const Hint = ({ children }: { children: React.ReactNode }) => (
  <Typography.Paragraph>
    <Typography.Text type="secondary">{children}</Typography.Text>
  </Typography.Paragraph>
);

const NodeDetailDialog = forwardRef<NodeDetailDialogHandle>(function NodeDetailDialog(_, ref) {
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [uuid, setUuid] = useState("");
  const [node, setNode] = useState<ComputedNode | null>(null);
  const [data, setData] = useState<Data>(DEFAULT_CONFIG);
  const [tab, setTab] = useState("basic");
  const patch = (p: Partial<Data>) => setData((d) => ({ ...d, ...p }));

  useImperativeHandle(ref, () => ({
    open: (n?: ComputedNode) => {
      if (n) {
        setNode(n);
        setEditMode(true);
        setUuid(n.uuid);
        const next: Data = {
          ...DEFAULT_CONFIG(),
          ...(n.config ?? {}),
          ip: n.ip, prefix: n.prefix, remarks: n.remarks,
          port: n.port,
          daemonPort: n.config?.port ?? 24444,
          apiKey: "",
          remoteMappings: n.remoteMappings ?? []
        };
        setData(next);
        form.setFieldsValue(next);
      } else {
        setNode(null);
        setEditMode(false);
        setUuid("");
        const next = DEFAULT_CONFIG();
        setData(next);
        form.setFieldsValue(next);
      }
      setTab("basic");
      setOpen(true);
    }
  }));

  const close = () => {
    setOpen(false);
    setLoading(false);
    setData(DEFAULT_CONFIG());
    setUuid("");
  };

  const remove = async () => {
    try {
      await deleteNode(uuid);
      close();
      message.success(t("TXT_CODE_a00e84d7"));
    } catch (error) {
      reportErrorMsg(error);
    }
  };

  const submit = async () => {
    try {
      await form.validateFields();
      setLoading(true);
      if (editMode) {
        await updateNode(uuid, { ...data, setting: { ...data } });
      } else {
        await addNode(data);
      }
      message.success(t("TXT_CODE_e74d658c"));
      const wasEdit = editMode;
      close();
      if (wasEdit) setTimeout(() => window.location.reload(), 150);
    } catch (error) {
      setLoading(false);
      const e = error as { errorFields?: unknown[]; message?: string };
      if (Array.isArray(e?.errorFields)) {
        message.warning(getValidatorErrorMsg(error, t("TXT_CODE_5245bd11")));
        return;
      }
      reportErrorMsg(e?.message ?? t("TXT_CODE_5245bd11"));
    }
  };

  const basic = (
    <Form form={form} layout="vertical" initialValues={data} onValuesChange={(c) => patch(c)}>
      <Form.Item label={t("TXT_CODE_a884de59")} name="remarks" rules={[{ required: true }]}>
        <Input placeholder={t("TXT_CODE_4b1d5199")} />
      </Form.Item>
      <Form.Item label={t("TXT_CODE_93f9b02a")} required>
        <Hint>
          {t("TXT_CODE_be7a689a")}
          <br />
          {t("TXT_CODE_c82a51b0")}
        </Hint>
        <Form.Item name="ip" noStyle rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        {ipNeedsMapping(data.ip) && <Typography.Text type="secondary">{t("TXT_CODE_93c3cb78")}</Typography.Text>}
      </Form.Item>
      <Form.Item label={t("TXT_CODE_4a6bf8c6")} required>
        <Hint>{t("TXT_CODE_df455795")}</Hint>
        <Form.Item name="port" noStyle rules={[{ required: true }]}>
          <Input />
        </Form.Item>
      </Form.Item>
      <Form.Item label={t("TXT_CODE_300c2ff4")} required={!editMode}>
        <Hint>
          {t("TXT_CODE_5ef2cf20")}{" "}
          <a href="https://docs.mcsmanager.com/advanced/distributed.html" target="_blank" rel="noopener noreferrer">
            {t("TXT_CODE_be1351ce")}
          </a>
        </Hint>
        <Form.Item name="apiKey" noStyle rules={[{ required: !editMode }]}>
          <Input.Password autoComplete="off" placeholder={editMode ? t("TXT_CODE_dc570cf2") : t("TXT_CODE_fe25087f")} />
        </Form.Item>
      </Form.Item>
      <Form.Item label={t("TXT_CODE_693f31d6")}>
        <Hint>{t("TXT_CODE_3e93e31e")}</Hint>
        <Form.Item name="prefix" noStyle>
          <Input />
        </Form.Item>
      </Form.Item>
    </Form>
  );

  const field = (label: string, hint: React.ReactNode, control: React.ReactNode) => (
    <Form.Item label={label}>
      <Typography.Paragraph>{hint}</Typography.Paragraph>
      {control}
    </Form.Item>
  );
  const sec = (k: string) => <Typography.Text type="secondary">{t(k)}</Typography.Text>;
  const speed = SPEED_RATE_OPTIONS();

  const advanced = (
    <Form layout="vertical">
      <Row gutter={16}>
        <Col span={12}>{field(t("TXT_CODE_fde31068"), sec("TXT_CODE_d8d19932"), <Select style={{ width: "100%" }} options={speed} value={data.uploadSpeedRate} onChange={(v) => patch({ uploadSpeedRate: v })} />)}</Col>
        <Col span={12}>{field(t("TXT_CODE_785a0fcf"), sec("TXT_CODE_b9fc604c"), <Select style={{ width: "100%" }} options={speed} value={data.downloadSpeedRate} onChange={(v) => patch({ downloadSpeedRate: v })} />)}</Col>
        <Col span={12}>{field(t("TXT_CODE_a15fca22"), sec("TXT_CODE_ecaf78a2"), <Input value={String(data.maxDownloadFromUrlFileCount)} onChange={(e) => patch({ maxDownloadFromUrlFileCount: e.target.value })} />)}</Col>
        <Col span={12}>
          {field(
            t("TXT_CODE_daemon_outputBufferSize"),
            <Tooltip title={t("TXT_CODE_daemon_outputBufferSizeInfo")} trigger="click">
              <Typography.Text type="secondary" style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}>
                {t("TXT_CODE_daemon_outputBufferSizeInfo")}
              </Typography.Text>
            </Tooltip>,
            <Input value={String(data.outputBufferSize)} onChange={(e) => patch({ outputBufferSize: e.target.value })} />
          )}
        </Col>
        <Col span={12}>{field(t("TXT_CODE_daemon_enableSoftShutdown"), sec("TXT_CODE_daemon_enableSoftShutdownInfo"), <Switch checked={data.enableSoftShutdown} onChange={(v) => patch({ enableSoftShutdown: v })} />)}</Col>
        <Col span={12}>{field(t("TXT_CODE_daemon_softShutdownSkipDocker"), sec("TXT_CODE_daemon_softShutdownSkipDockerInfo"), <Switch checked={data.softShutdownSkipDocker} onChange={(v) => patch({ softShutdownSkipDocker: v })} />)}</Col>
        <Col span={12}>{field(t("TXT_CODE_daemon_softShutdownWaitSeconds"), sec("TXT_CODE_daemon_softShutdownWaitSecondsInfo"), <Input value={String(data.softShutdownWaitSeconds)} onChange={(e) => patch({ softShutdownWaitSeconds: e.target.value })} />)}</Col>
      </Row>
      {field(t("TXT_CODE_cd1f9ef7"), sec("TXT_CODE_75ef0619"), <Input value={String(data.daemonPort)} onChange={(e) => patch({ daemonPort: e.target.value })} />)}
      {field(
        t("TXT_CODE_bbe23ee7"),
        sec("TXT_CODE_497568db"),
        <Card>
          <NodeRemoteMappingEdit value={data.remoteMappings} onChange={(v) => patch({ remoteMappings: v })} />
        </Card>
      )}
    </Form>
  );

  return (
    <Modal
      open={open}
      title={editMode ? t("TXT_CODE_39c5229e") : t("TXT_CODE_15a381d5")}
      width="800px"
      onCancel={close}
      forceRender
      footer={
        <div className="justify-space-between">
          {editMode ? (
            <Popconfirm title={t("TXT_CODE_fb267b0b")} okText="Yes" cancelText="No" onConfirm={remove}>
              <Button danger>{t("TXT_CODE_8b937b23")}</Button>
            </Popconfirm>
          ) : (
            <span />
          )}
          <div className="right">
            <Button onClick={close}>{t("TXT_CODE_a0451c97")}</Button>
            <Button type="primary" loading={loading} onClick={submit}>
              {t("TXT_CODE_d507abff")}
            </Button>
          </div>
        </div>
      }
    >
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "basic", label: t("TXT_CODE_cc7b54b9"), children: basic, forceRender: true },
          ...(node?.available ? [{ key: "advanced", label: t("TXT_CODE_31a1d824"), children: advanced }] : [])
        ]}
      />
    </Modal>
  );
});

export default NodeDetailDialog;
