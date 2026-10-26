/** Terminal settings: PTY, colours, line endings, stop command, encodings (port of dialogs/TermConfig.vue). */
import { Col, Input, Modal, Row, Select, Switch } from "antd";
import { useState } from "react";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";
import { INSTANCE_STATUS_CODE, type InstanceDetail } from "@/types/instance";
import { TERMINAL_CODE } from "@/types/instanceDefaults";
import { Field, lines, useInstanceDialog, type InstanceDialogProps } from "./configDialog";

function TermConfig({ info, ...p }: InstanceDialogProps & { info: InstanceDetail }) {
  const { open, loading, close, save } = useInstanceDialog(p);
  const { isPhone } = useScreen();
  const [cfg, setCfg] = useState(() => structuredClone(info.config));
  const term = cfg.terminalOption;
  const setTerm = (patch: Partial<typeof term>) => setCfg((c) => ({ ...c, terminalOption: { ...c.terminalOption, ...patch } }));
  const width = isPhone ? "100%" : 220;
  const codeOptions = TERMINAL_CODE.map((v) => ({ value: v, label: v }));

  const submit = () => {
    // Switching PTY mode needs the process restarted, so the daemon refuses it while running.
    const ptyChanged = info.config.terminalOption?.pty !== term.pty;
    if (ptyChanged && info.status !== INSTANCE_STATUS_CODE.STOPPED && info.status !== INSTANCE_STATUS_CODE.BUSY) {
      return reportErrorMsg(t("TXT_CODE_instanceConf.cantModifyPtyModel"));
    }
    void save({ terminalOption: term, crlf: cfg.crlf, ie: cfg.ie, oe: cfg.oe, stopCommand: cfg.stopCommand });
  };

  return (
    <Modal open={open} centered width="auto" title={t("TXT_CODE_d23631cb")} confirmLoading={loading} okText={t("TXT_CODE_abfe9512")} onOk={submit} onCancel={() => close()}>
      <Row gutter={[24, 24]}>
        <Col xs={24} md={12}>
          <Field title={t("TXT_CODE_ef650d57")} desc={lines("TXT_CODE_feeea328", "TXT_CODE_d6e7f572")}>
            <Switch checked={term.pty} onChange={(v) => setTerm({ pty: v })} />
          </Field>
          <Field title={t("TXT_CODE_e1a3b150")} desc={lines("TXT_CODE_6a515e35", "TXT_CODE_1295831e")}>
            <Switch checked={term.haveColor} onChange={(v) => setTerm({ haveColor: v })} />
          </Field>
          <Field title={t("TXT_CODE_b91a94f9")} desc={lines("TXT_CODE_5b2daea0", "TXT_CODE_b94f13ce")}>
            <Select
              value={cfg.crlf}
              placeholder={t("TXT_CODE_3bb646e4")}
              style={{ width }}
              onChange={(v) => setCfg((c) => ({ ...c, crlf: v }))}
              options={[
                { value: 1, label: t("TXT_CODE_365aabd4") },
                { value: 2, label: t("TXT_CODE_20cec54") }
              ]}
            />
          </Field>
        </Col>
        <Col xs={24} md={12}>
          <Field title={t("TXT_CODE_11cfe3a1")} desc={t("TXT_CODE_7ec7ccb8")}>
            <Input value={cfg.stopCommand} style={{ width }} onChange={(e) => setCfg((c) => ({ ...c, stopCommand: e.target.value }))} />
          </Field>
          <Field title={t("TXT_CODE_449d1581")} desc={t("TXT_CODE_d16d82ab")}>
            <Select
              className="mr-10 mb-20"
              value={cfg.ie}
              placeholder={t("TXT_CODE_bd2559f3")}
              style={{ width }}
              options={codeOptions}
              onChange={(v) => setCfg((c) => ({ ...c, ie: v }))}
            />
            <Select value={cfg.oe} placeholder={t("TXT_CODE_6e96b2a9")} style={{ width }} options={codeOptions} onChange={(v) => setCfg((c) => ({ ...c, oe: v }))} />
          </Field>
        </Col>
      </Row>
    </Modal>
  );
}

export const openTermConfigDialog = (info: InstanceDetail, instanceId: string, daemonId: string) =>
  openDialog<boolean>((done) => <TermConfig info={info} instanceId={instanceId} daemonId={daemonId} done={done} />);
