/**
 * Steam RCON settings (port of dialogs/RconSettings.vue).
 * SECURITY: the RCON password is shown in a masked field (upstream used a
 * plain input) so it is not exposed on screen shares (CWE-549).
 */
import { Input, Modal, Switch, Typography } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import type { InstanceDetail } from "@/types/instance";
import { Field, useInstanceDialog, type InstanceDialogProps } from "./configDialog";

function RconSettings({ info, ...p }: InstanceDialogProps & { info: InstanceDetail }) {
  const { open, loading, close, save } = useInstanceDialog(p);
  const c = info.config;
  const [form, setForm] = useState({
    rconIp: c.rconIp ?? "",
    rconPassword: c.rconPassword ?? "",
    rconPort: String(c.rconPort || ""),
    enableRcon: c.enableRcon ?? false
  });
  const submit = () =>
    void save({ rconIp: form.rconIp, rconPassword: form.rconPassword, rconPort: Number(form.rconPort || 0), enableRcon: form.enableRcon });

  return (
    <Modal open={open} centered title={t("TXT_CODE_282b0721")} confirmLoading={loading} okText={t("TXT_CODE_abfe9512")} onOk={submit} onCancel={() => close()}>
      <Typography.Paragraph>
        <Typography.Text type="secondary">{t("TXT_CODE_32d87bf1")}</Typography.Text>
      </Typography.Paragraph>
      <Field title={t("TXT_CODE_179d7be4")} desc={t("TXT_CODE_a8839b35")}>
        <Switch checked={form.enableRcon} onChange={(v) => setForm((f) => ({ ...f, enableRcon: v }))} />
      </Field>
      <Field title={t("TXT_CODE_d629fa48")} desc={t("TXT_CODE_8e2be926")}>
        <Input value={form.rconIp} placeholder={t("TXT_CODE_47129a5b")} onChange={(e) => setForm((f) => ({ ...f, rconIp: e.target.value }))} />
      </Field>
      <Field title={t("TXT_CODE_890aa44c")} desc={t("TXT_CODE_a4748cb0")}>
        <Input value={form.rconPort} placeholder={t("TXT_CODE_e2dc0156")} onChange={(e) => setForm((f) => ({ ...f, rconPort: e.target.value }))} />
      </Field>
      <Field title={t("TXT_CODE_2880eed4")} desc={t("TXT_CODE_3ae0276b")}>
        <Input.Password
          value={form.rconPassword}
          autoComplete="new-password"
          placeholder={t("TXT_CODE_25af3af3")}
          onChange={(e) => setForm((f) => ({ ...f, rconPassword: e.target.value }))}
        />
      </Field>
    </Modal>
  );
}

export const openRconSettingsDialog = (info: InstanceDetail, instanceId: string, daemonId: string) =>
  openDialog<boolean>((done) => <RconSettings info={info} instanceId={instanceId} daemonId={daemonId} done={done} />);
