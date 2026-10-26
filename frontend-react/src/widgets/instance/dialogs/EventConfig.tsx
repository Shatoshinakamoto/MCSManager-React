/** Auto-start / auto-restart settings (port of dialogs/EventConfig.vue). */
import { Input, Modal, Switch } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import type { InstanceDetail } from "@/types/instance";
import { Field, lines, useInstanceDialog, type InstanceDialogProps } from "./configDialog";

function EventConfig({ info, ...p }: InstanceDialogProps & { info: InstanceDetail }) {
  const { open, loading, close, save } = useInstanceDialog(p);
  const [ev, setEv] = useState(() => ({ ...info.config.eventTask }));

  return (
    <Modal open={open} centered title={t("TXT_CODE_10150756")} confirmLoading={loading} okText={t("TXT_CODE_abfe9512")} onOk={() => void save({ eventTask: ev })} onCancel={() => close()}>
      <Field title={t("TXT_CODE_a64da7c4")} desc={lines("TXT_CODE_619faab6", "TXT_CODE_3eb58633")}>
        <Switch checked={ev.autoRestart} onChange={(v) => setEv((e) => ({ ...e, autoRestart: v }))} />
      </Field>
      {ev.autoRestart && (
        <Field title={t("TXT_CODE_f4b52ed4")} desc={t("TXT_CODE_9d2fca76")}>
          <Input
            value={ev.autoRestartMaxTimes}
            style={{ width: 220 }}
            onChange={(e) => {
              // Whole numbers only; the daemon also validates this.
              const v = e.target.value.replace(/[^0-9]/g, "");
              setEv((x) => ({ ...x, autoRestartMaxTimes: v === "" ? 0 : Number(v) }));
            }}
          />
        </Field>
      )}
      <Field title={t("TXT_CODE_273d24e0")} desc={lines("TXT_CODE_8d9f5a4e", "TXT_CODE_64bf4386")}>
        <Switch checked={ev.autoStart} onChange={(v) => setEv((e) => ({ ...e, autoStart: v }))} />
      </Field>
    </Modal>
  );
}

export const openEventConfigDialog = (info: InstanceDetail, instanceId: string, daemonId: string) =>
  openDialog<boolean>((done) => <EventConfig info={info} instanceId={instanceId} daemonId={daemonId} done={done} />);
