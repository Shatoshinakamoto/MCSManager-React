/**
 * New-instance form for the quick start flow and the market's manual install
 * options (port of widgets/setupApp/CreateInstanceForm.vue).
 *
 * Methods: DOCKER and EXIST/SELECT create the instance directly; FILE uploads
 * one program file and IMPORT uploads an archive the daemon unzips.
 *
 * SECURITY: the start command runs on the daemon host, so this form is only
 * reachable by panel admins (the /api/instance and /api/instance/upload routes
 * enforce that server side). Uploads go through the shared upload service
 * with the one-time password the panel issues for this instance.
 */
import { CheckOutlined, CloseOutlined, InfoCircleOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Button, Col, Input, Row, Select, Switch, Typography, Upload } from "antd";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getFileConfigAddr } from "@/hooks/useFileManager";
import { instanceTypeTranslation, TYPE_MINECRAFT_BUNGEECORD } from "@/hooks/useInstance";
import { QUICKSTART_ACTION_TYPE, QUICKSTART_METHOD } from "@/hooks/quickStartFlow";
import { t } from "@/lang/i18n";
import { createInstance, uploadAddress } from "@/services/apis/instance";
import uploadService, { useUploadState, type UploadFiles } from "@/services/uploadService";
import { parseForwardAddress } from "@/tools/protocol";
import { reportErrorMsg } from "@/tools/validator";
import { defaultInstanceInfo } from "@/types/instanceDefaults";
import DockerImageSelect from "@/widgets/instance/dialogs/components/DockerImageSelect";
import { openSelectUnzipCode } from "./SelectUnzipCode";

function stopCommandFor(appType: string): string | undefined {
  if (appType.includes(QUICKSTART_ACTION_TYPE.Minecraft)) return appType === TYPE_MINECRAFT_BUNGEECORD ? "end" : "stop";
  if (appType.includes(QUICKSTART_ACTION_TYPE.Bedrock) || appType.includes(QUICKSTART_ACTION_TYPE.Terraria)) return "stop";
  if (appType.includes(QUICKSTART_ACTION_TYPE.SteamGameServer) || appType.includes(QUICKSTART_ACTION_TYPE.AnyApp)) return "^c";
  return undefined;
}

/** Title, grey description and input, laid out like upstream's a-form-item blocks. */
function Field({ title, desc, required, error, children }: { title: ReactNode; desc?: ReactNode; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div className={`ant-form-item${error ? " ant-form-item-has-error" : ""}`} style={{ marginBottom: 24 }}>
      <Typography.Title level={5} className={required ? "require-field" : undefined}>
        {title}
      </Typography.Title>
      {desc && (
        <Typography.Paragraph>
          <Typography.Text type="secondary">{desc}</Typography.Text>
        </Typography.Paragraph>
      )}
      {children}
      {error && <div className="ant-form-item-explain-error" style={{ color: "var(--ant-color-error, #ff4d4f)" }}>{error}</div>}
    </div>
  );
}

export default function CreateInstanceForm({
  createMethod,
  daemonId,
  onNextStep
}: {
  createMethod: QUICKSTART_METHOD;
  daemonId: string;
  onNextStep: (instanceUuid: string) => void;
}) {
  const { message, modal } = App.useApp();
  // Upstream bound the shared defaultInstanceInfo object directly, so a second
  // form opened with the first one's values; each form gets its own copy here.
  const [cfg, setCfg] = useState<IGlobalInstanceConfig>(() => structuredClone(defaultInstanceInfo));
  const [touched, setTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploadTask, setUploadTask] = useState<UploadFiles>();
  const [uploadStarted, setUploadStarted] = useState(false);
  const upload = useUploadState();
  const callbacks = useRef<{ task?: UploadFiles; start?: () => void; end?: () => void }>({});
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const isImportMode = createMethod === QUICKSTART_METHOD.IMPORT;
  const isFileMode = createMethod === QUICKSTART_METHOD.FILE;
  const needUpload = isImportMode || isFileMode;
  const isDocker = createMethod === QUICKSTART_METHOD.DOCKER;

  useEffect(
    () => () => {
      const { task, start, end } = callbacks.current;
      if (task && start) task.removeCallback("start", start);
      if (task && end) task.removeCallback("end", end);
    },
    []
  );

  const set = <K extends keyof IGlobalInstanceConfig>(key: K, value: IGlobalInstanceConfig[K]) => setCfg((c) => ({ ...c, [key]: value }));
  const setDocker = (p: Partial<IGlobalInstanceConfig["docker"]>) => setCfg((c) => ({ ...c, docker: { ...c.docker, ...p } }));

  const nicknameError = touched && !cfg.nickname ? t("TXT_CODE_68a504b3") : undefined;
  const stopCommandError = touched && !cfg.stopCommand ? t("TXT_CODE_83053cd5") : undefined;

  /** Final config sent to the panel; never mutates component state. */
  const buildConfig = (file?: File): IGlobalInstanceConfig => {
    const c = structuredClone(cfgRef.current);
    if (!c.cwd) c.cwd = ".";
    if (c.docker?.image) c.processType = "docker";
    if (isFileMode && file) c.startCommand = c.startCommand.replace("${ProgramName}", file.name);
    return c;
  };

  const doCreate = async () => {
    setCreating(true);
    try {
      const res = await createInstance({ params: { daemonId }, data: buildConfig(), errorAlert: false });
      if (res) onNextStep(res.instanceUuid);
      message.success(t("TXT_CODE_d28c05df"));
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setCreating(false);
    }
  };

  const doUpload = async (file: File, code: string) => {
    try {
      const res = await uploadAddress({ params: { upload_dir: ".", daemonId }, data: buildConfig(file), errorAlert: false });
      if (!res) throw new Error(t("TXT_CODE_e8ce38c2"));
      const addr = parseForwardAddress(getFileConfigAddr(res), "http");
      const start = () => setUploadStarted(true);
      const instanceUuid = res.instanceUuid;
      const end = () => {
        onNextStep(instanceUuid);
        message.success(t("TXT_CODE_d28c05df"));
      };
      const task = uploadService.append(file, addr, res.password, { overwrite: false, unzip: isImportMode, code }, (task) => task.addCallback("start", start));
      task.addCallback("end", end);
      callbacks.current = { task, start, end };
      setUploadTask(task);
    } catch (err) {
      console.error(err);
      reportErrorMsg(err);
    }
  };

  const finalConfirm = (file?: File, code = "utf-8") => {
    setTouched(true);
    const c = cfgRef.current;
    if (!c.nickname || !c.stopCommand) return reportErrorMsg(t("TXT_CODE_47e21c80"));
    modal.confirm({
      title: t("TXT_CODE_2a3b0c17"),
      icon: <InfoCircleOutlined />,
      content: needUpload ? t("TXT_CODE_e06841b5") : t("TXT_CODE_5deeefb5"),
      okText: t("TXT_CODE_d507abff"),
      onOk: () => {
        void (needUpload && file ? doUpload(file, code) : doCreate());
      }
    });
  };

  const beforeUpload = async (file: File) => {
    if (isImportMode) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!["zip", "jar"].includes(ext)) {
        reportErrorMsg(t("TXT_CODE_808e5ad9"));
        return false;
      }
      const code = await openSelectUnzipCode();
      if (code) finalConfirm(file, code);
    } else {
      finalConfirm(file);
    }
    return false;
  };

  const percentComplete = uploadStarted && upload.current ? (upload.current[0] / upload.current[1]) * 100 : 0;
  const percentText = () => {
    if (!uploadTask) return t("TXT_CODE_c17f6488");
    if (uploadStarted) return t("TXT_CODE_b625dbf0") + percentComplete.toFixed(0) + "%";
    return t("TXT_CODE_f63c4be2", { n: uploadService.getFileNth(uploadTask.id || "") });
  };

  const typeOptions = Object.entries(instanceTypeTranslation()).map(([value, label]) => ({ value, label }));

  return (
    <div style={{ textAlign: "left" }}>
      {isDocker && (
        <Typography.Paragraph>
          <InfoCircleOutlined /> {t("TXT_CODE_b51bac6f")}
        </Typography.Paragraph>
      )}
      <form autoComplete="off" className="ant-form ant-form-vertical" onSubmit={(e) => e.preventDefault()}>
        <Row gutter={20}>
          <Col xs={24} md={12}>
            <Field title={t("TXT_CODE_f70badb9")} desc={t("TXT_CODE_818928ba")} required error={nicknameError}>
              <Input value={cfg.nickname} status={nicknameError ? "error" : undefined} placeholder={t("TXT_CODE_475c5890")} onChange={(e) => set("nickname", e.target.value)} />
            </Field>
          </Col>
          <Col xs={24} md={12}>
            <Field title={t("TXT_CODE_2f291d8b")} desc={t("TXT_CODE_be608c82")} required>
              <Select
                style={{ width: "100%" }}
                value={cfg.type}
                placeholder={t("TXT_CODE_3bb646e4")}
                options={typeOptions}
                onChange={(type: string) =>
                  setCfg((c) => {
                    const stopCommand = stopCommandFor(type);
                    return { ...c, type, ...(stopCommand ? { stopCommand } : {}) };
                  })
                }
              />
            </Field>
          </Col>
        </Row>

        {isDocker && (
          <>
            <Row gutter={20}>
              <Col xs={24} md={12}>
                <Field title={t("TXT_CODE_d12f5b1c")} desc={t("TXT_CODE_c7a43089")} required>
                  <DockerImageSelect value={cfg.docker?.image ?? ""} daemonId={daemonId ?? ""} onChange={(image) => setDocker({ image })} />
                </Field>
              </Col>
              <Col xs={24} md={12}>
                <Field title={t("TXT_CODE_5484094a")} desc={t("TXT_CODE_60dd05d5")} required>
                  <Switch
                    checked={!!cfg.docker?.changeWorkdir}
                    checkedChildren={<CheckOutlined />}
                    unCheckedChildren={<CloseOutlined />}
                    onChange={(changeWorkdir) => setDocker({ changeWorkdir })}
                  />
                </Field>
              </Col>
            </Row>
            <Row gutter={20}>
              <Col xs={24} sm={12}>
                <Field title={t("TXT_CODE_20d110b3")} desc={t("TXT_CODE_877eea45")}>
                  <Input value={cfg.cwd} placeholder={t("TXT_CODE_a85091a4")} onChange={(e) => set("cwd", e.target.value)} />
                </Field>
              </Col>
              <Col xs={24} md={12}>
                <Field title={t("TXT_CODE_81979d0f")} desc={t("TXT_CODE_3407250a")}>
                  <Input value={cfg.docker?.workingDir} placeholder={t("TXT_CODE_2082f659")} onChange={(e) => setDocker({ workingDir: e.target.value })} />
                </Field>
              </Col>
            </Row>
          </>
        )}

        <Field
          title={t("TXT_CODE_d12fa808")}
          desc={createMethod === QUICKSTART_METHOD.IMPORT ? t("TXT_CODE_17544b7b") : isDocker ? t("TXT_CODE_26495d02") : t("TXT_CODE_8c0db3f4")}
        >
          <div style={{ display: "flex" }}>
            <Input.TextArea value={cfg.startCommand} rows={2} placeholder={t("TXT_CODE_d4ad1dd")} style={{ minHeight: 30 }} onChange={(e) => set("startCommand", e.target.value)} />
          </div>
        </Field>

        <Field title={t("TXT_CODE_2e2c6b7b")} desc={<span className="typography-text-ellipsis">{t("TXT_CODE_4f387c5a")}</span>}>
          <Input.TextArea value={cfg.updateCommand} rows={2} style={{ minHeight: 30 }} placeholder={t("TXT_CODE_36bd6348")} onChange={(e) => set("updateCommand", e.target.value)} />
        </Field>

        {createMethod === QUICKSTART_METHOD.EXIST && (
          <Field title={t("TXT_CODE_ee67e1a3")} desc={t("TXT_CODE_877eea45")}>
            <Input value={cfg.cwd} placeholder={t("TXT_CODE_a85091a4")} onChange={(e) => set("cwd", e.target.value)} />
          </Field>
        )}

        <Row gutter={20}>
          <Col xs={24} sm={12}>
            <Field title={t("TXT_CODE_11cfe3a1")} desc={t("TXT_CODE_7ec7ccb8")} required error={stopCommandError}>
              <Input value={cfg.stopCommand} status={stopCommandError ? "error" : undefined} placeholder={t("TXT_CODE_83053cd5")} onChange={(e) => set("stopCommand", e.target.value)} />
            </Field>
          </Col>
        </Row>

        {isFileMode ? (
          <Field title={t("TXT_CODE_444db70f")} desc={t("TXT_CODE_fc4e2173")} required>
            <Upload accept=".jar" beforeUpload={beforeUpload} maxCount={1} disabled={percentComplete > 0 || !!uploadTask}>
              <Button type="primary" loading={percentComplete > 0 || !!uploadTask} icon={percentComplete === 0 && !uploadTask ? <UploadOutlined /> : undefined}>
                {uploadTask ? percentText() : t("TXT_CODE_335ba209")}
              </Button>
            </Upload>
          </Field>
        ) : isImportMode ? (
          <Field
            title={t("TXT_CODE_f9b6e61b")}
            desc={
              <>
                {t("TXT_CODE_510bd294")}
                <br />
                {t("TXT_CODE_1561198c")}
              </>
            }
            required
          >
            <Upload accept=".zip" beforeUpload={beforeUpload} maxCount={1} disabled={percentComplete > 0 || !!uploadTask}>
              <Button
                disabled={!cfg.nickname}
                type="primary"
                loading={percentComplete > 0 || !!uploadTask}
                icon={percentComplete === 0 && !uploadTask ? <UploadOutlined /> : undefined}
              >
                {percentText()}
              </Button>
            </Upload>
          </Field>
        ) : (
          <div className="ant-form-item">
            <Typography.Paragraph className="mt-10">
              <Typography.Text>
                <span>{t("TXT_CODE_7da6e84")}</span>
              </Typography.Text>
            </Typography.Paragraph>
            <Button type="primary" loading={creating} onClick={() => finalConfirm()}>
              {t("TXT_CODE_5a74975b")}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
