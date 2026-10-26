/** Minecraft status ping address (port of dialogs/McPingSettings.vue). */
import { Input, Modal, Typography } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import type { InstanceDetail } from "@/types/instance";
import { Field, lines, useInstanceDialog, type InstanceDialogProps } from "./configDialog";

function McPingSettings({ info, ...p }: InstanceDialogProps & { info: InstanceDetail }) {
  const { open, loading, close, save } = useInstanceDialog(p);
  const ping = info.config.pingConfig;
  const [form, setForm] = useState({ ip: ping?.ip || "", port: String(ping?.port || ""), type: ping?.type ?? 1 });
  const submit = () => void save({ pingConfig: { ip: form.ip, port: Number(form.port), type: form.type } });

  return (
    <Modal open={open} centered title={t("TXT_CODE_40241d8e")} confirmLoading={loading} okText={t("TXT_CODE_abfe9512")} onOk={submit} onCancel={() => close()}>
      <Typography.Paragraph>
        <Typography.Text type="secondary">{lines("TXT_CODE_57d1929e", "TXT_CODE_6b175558")}</Typography.Text>
      </Typography.Paragraph>
      <Field title={t("TXT_CODE_f49149d0")} desc={t("TXT_CODE_2ab036a4")}>
        <Input value={form.port} placeholder={t("TXT_CODE_e2dc0156")} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} />
      </Field>
      <Field title={t("TXT_CODE_2f59807a")} desc={t("TXT_CODE_8e2be926")}>
        <Input value={form.ip} placeholder={t("TXT_CODE_ddc2de99")} onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))} />
      </Field>
    </Modal>
  );
}

export const openMcPingSettingsDialog = (info: InstanceDetail, instanceId: string, daemonId: string) =>
  openDialog<boolean>((done) => <McPingSettings info={info} instanceId={instanceId} daemonId={daemonId} done={done} />);
