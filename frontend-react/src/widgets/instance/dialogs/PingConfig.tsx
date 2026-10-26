/**
 * Older server-ping settings dialog (port of widgets/instance/dialogs/PingConfig.vue).
 * Upstream and the Johnnykins fork keep it but its button in ManagerBtns is
 * commented out; McPingSettings is the dialog the instance menu opens. This
 * port keeps it so nothing from the Vue UI is lost; it saves the same
 * pingConfig object (address, port, and the existing ping type).
 *
 * SECURITY: sent to PUT /api/protected_instance/instance_update like the
 * other small dialogs; the panel checks the user's access to the instance.
 */
import { Input, Modal } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import type { InstanceDetail } from "@/types/instance";
import { Field, useInstanceDialog, type InstanceDialogProps } from "./configDialog";

function PingConfig({ info, ...p }: InstanceDialogProps & { info: InstanceDetail }) {
  const { open, loading, close, save } = useInstanceDialog(p);
  const ping = info.config.pingConfig;
  const [form, setForm] = useState({ ip: ping?.ip ?? "", port: String(ping?.port ?? "") });
  const submit = () => void save({ pingConfig: { ...ping, ip: form.ip, port: Number(form.port) } });

  return (
    <Modal open={open} centered title={t("TXT_CODE_23b02a65")} confirmLoading={loading} okText={t("TXT_CODE_abfe9512")} onOk={submit} onCancel={() => close()}>
      <Field title={t("TXT_CODE_2498e4ed")} desc={t("TXT_CODE_e7335483")}>
        {null}
      </Field>
      <Field title={t("TXT_CODE_8e632796")} desc={t("TXT_CODE_c93f32f8")}>
        <Input value={form.ip} onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))} />
      </Field>
      <Field title={t("TXT_CODE_243a463")} desc={t("TXT_CODE_e9935066")}>
        <Input type="number" value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} />
      </Field>
    </Modal>
  );
}

/** Opens the older ping settings dialog; resolves true when saved. */
export const openPingConfigDialog = (info: InstanceDetail, instanceId: string, daemonId: string) =>
  openDialog<boolean>((done) => <PingConfig info={info} instanceId={instanceId} daemonId={daemonId} done={done} />);
