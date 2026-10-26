/**
 * Limited instance settings for regular users of Docker instances when the
 * panel allows changing commands (port of dialogs/InstanceFundamentalDetail.vue):
 * start command, update command, file encoding and container environment.
 *
 * SECURITY: the panel's user route only accepts these fields from
 * non-administrators; disabled inputs here are presentation only.
 */
import { App, Button, Col, DatePicker, Input, Modal, Row, Select, Typography } from "antd";
import { useState } from "react";
import { openDockerEnvEditDialog } from "@/components/fc/DockerEditDialogs";
import SafeHtml from "@/components/SafeHtml";
import { instanceTypeTranslation } from "@/hooks/useInstance";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { openDialog } from "@/stores/dialogHost";
import { timestampToDayjs } from "@/tools/time";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail } from "@/types/instance";
import { TERMINAL_CODE } from "@/types/instanceDefaults";
import { Field } from "./configDialog";

interface Props {
  info: InstanceDetail;
  instanceId: string;
  daemonId: string;
  done: (saved: boolean) => void;
}

function InstanceFundamentalDetail({ info, instanceId, daemonId, done }: Props) {
  const { message } = App.useApp();
  const { isPhone } = useScreen();
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState(() => structuredClone(info.config));
  const isDocker = cfg.processType === "docker";
  const close = (saved: boolean) => {
    setOpen(false);
    done(saved);
  };

  const submit = async () => {
    if (String(cfg.startCommand ?? "").includes("\n")) return void reportErrorMsg(t("TXT_CODE_bbbda29"));
    setLoading(true);
    try {
      // endTime is not editable here, so the stored value is sent back unchanged.
      await updateInstanceConfig({ params: { uuid: instanceId, daemonId }, data: { ...cfg } as Record<string, unknown> });
      message.success(t("TXT_CODE_d3de39b4"));
      close(true);
    } catch (error) {
      reportErrorMsg(error instanceof Error ? error : t("TXT_CODE_9911ac11"));
    } finally {
      setLoading(false);
    }
  };

  const editEnv = async () => {
    // Split on the first "=" only, so values that contain "=" survive the round trip.
    const rows = (cfg.docker.env || []).map((v) => {
      const [label = "", ...rest] = v.split("=");
      return { label, value: rest.join("=") };
    });
    const result = await openDockerEnvEditDialog(rows);
    setCfg((c) => ({ ...c, docker: { ...c.docker, env: result.map((v) => `${v.label}=${v.value}`) } }));
  };

  const updateCmdTemplate = t("TXT_CODE_61ca492b") + '"C:/SteamCMD/steamcmd.exe" +login anonymous +force_install_dir "{mcsm_workspace}" "+app_update 380870 validate" +quit';

  return (
    <Modal
      open={open}
      centered
      mask={{ closable: false }}
      width={isPhone ? "100%" : 1200}
      title={t("TXT_CODE_aac98b2a")}
      confirmLoading={loading}
      okText={t("TXT_CODE_abfe9512")}
      onOk={() => void submit()}
      onCancel={() => close(false)}
    >
      <div className="dialog-overflow-container">
        <Typography.Paragraph>
          <Typography.Text type="secondary">{t("TXT_CODE_66f38b2e")}</Typography.Text>
        </Typography.Paragraph>
        <Row gutter={20}>
          <Col xs={24} lg={6}>
            <Field title={t("TXT_CODE_f70badb9")} desc={t("TXT_CODE_818928ba")}>
              <Input value={cfg.nickname} disabled />
            </Field>
          </Col>
          <Col xs={24} lg={6}>
            <Field title={t("TXT_CODE_2f291d8b")} desc={t("TXT_CODE_be608c82")}>
              <Input value={instanceTypeTranslation()[cfg.type]} disabled />
            </Field>
          </Col>
          <Col xs={24} lg={6}>
            <Field title={t("TXT_CODE_fa920c0")} desc={t("TXT_CODE_b029a155")}>
              <DatePicker value={timestampToDayjs(cfg.endTime)} size="large" showTime style={{ width: "100%" }} placeholder={t("TXT_CODE_e3a77a77")} disabled />
            </Field>
          </Col>
          <Col xs={24} lg={6}>
            <Field title={<span className="require-field">{t("TXT_CODE_f041de90")}</span>} desc={t("TXT_CODE_6e69b5a5")}>
              <Select
                style={{ width: "100%" }}
                value={cfg.fileCode}
                placeholder={t("TXT_CODE_3bb646e4")}
                options={TERMINAL_CODE.map((v) => ({ value: v, label: v }))}
                onChange={(v) => setCfg((c) => ({ ...c, fileCode: v }))}
              />
            </Field>
          </Col>
          <Col xs={24}>
            <Field title={<span className={isDocker ? "require-field" : undefined}>{t("TXT_CODE_d12fa808")}</span>} desc={<SafeHtml html={t("TXT_CODE_A0000001")} />}>
              <Input.TextArea
                value={cfg.startCommand}
                rows={5}
                style={{ minHeight: 40 }}
                placeholder={isDocker ? t("TXT_CODE_98e7c829") : t("TXT_CODE_f50cfe2")}
                disabled={!isDocker}
                onChange={(e) => setCfg((c) => ({ ...c, startCommand: e.target.value }))}
              />
            </Field>
          </Col>
          <Col xs={24} lg={18}>
            <Field
              title={t("TXT_CODE_bb0b9711")}
              desc={
                <>
                  <span>{t("TXT_CODE_4f387c5a")}</span>
                  <br />
                  <SafeHtml html={t("TXT_CODE_fa487a47")} />
                </>
              }
            >
              <Input value={cfg.updateCommand} placeholder={updateCmdTemplate} disabled={!isDocker} onChange={(e) => setCfg((c) => ({ ...c, updateCommand: e.target.value }))} />
            </Field>
          </Col>
          <Col xs={24} lg={6}>
            <Field title={t("TXT_CODE_b916a8dc")} desc={<span style={isPhone ? undefined : { display: "block", height: 44 }}>{t("TXT_CODE_33ce1c5c")}</span>}>
              <Button type="default" onClick={() => void editEnv()}>
                {t("TXT_CODE_ad207008")}
              </Button>
            </Field>
          </Col>
        </Row>
      </div>
    </Modal>
  );
}

export const openInstanceFundamentalDetailDialog = (info: InstanceDetail, instanceId: string, daemonId: string) =>
  openDialog<boolean>((done) => <InstanceFundamentalDetail info={info} instanceId={instanceId} daemonId={daemonId} done={done} />);
