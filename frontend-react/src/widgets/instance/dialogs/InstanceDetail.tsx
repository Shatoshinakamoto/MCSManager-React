/**
 * Full instance settings for administrators (port of dialogs/InstanceDetail.vue):
 * basic, advanced, Docker and resource-limit tabs.
 *
 * Template mode (market editor) adds a Template tab, hides the per-instance
 * fields and returns the edited template instead of saving anything; the
 * editor uploads the whole market file afterwards.
 *
 * SECURITY: the whole config is sent to PUT /api/instance, which the panel
 * only allows for administrators. Docker options such as privileged mode,
 * capabilities, devices and extra volumes are additionally checked by the
 * daemon's Johnnykins Docker gates (see docs/configuration/daemon-johnnykins.md);
 * this form does not enforce them.
 */
import { CheckOutlined, CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Button, Col, DatePicker, Divider, Image, Input, InputNumber, Modal, Radio, Row, Select, Space, Switch, Tabs, Tag, Tooltip, Typography } from "antd";
import type { Dayjs } from "dayjs";
import { useState, type ReactNode } from "react";
import {
  openDockerCapabilityEditDialog,
  openDockerDeviceEditDialog,
  openDockerEnvEditDialog,
  openDockerLabelEditDialog,
  openPortEditDialog,
  openVolumeEditDialog
} from "@/components/fc/DockerEditDialogs";
import { openCmdAssistantDialog } from "@/components/fc/CmdAssistantDialog";
import { openUploadFileDialog } from "@/components/fc/UploadFileDialog";
import SafeHtml from "@/components/SafeHtml";
import { GLOBAL_INSTANCE_NAME } from "@/config/const";
import { instanceTypeTranslation } from "@/hooks/useInstance";
import { runAsFieldState, useNodeRunAs } from "@/hooks/useNodeRunAs";
import { useIsWebAdmin } from "@/stores/appState";
import { useScreen } from "@/hooks/useScreen";
import { SEARCH_ALL_KEY, type FilterOption } from "@/hooks/useMarketPackages";
import { getCurrentLang, t } from "@/lang/i18n";
import { getNetworkModeList } from "@/services/apis/envImage";
import { updateAnyInstanceConfig } from "@/services/apis/instance";
import { openDialog } from "@/stores/dialogHost";
import { dockerPortsArray } from "@/tools/common";
import { dayjsToTimestamp, timestampToDayjs } from "@/tools/time";
import { safeHttpUrl } from "@/tools/safeUrl";
import { reportErrorMsg } from "@/tools/validator";
import type { DockerNetworkModes } from "@/types/docker";
import type { QuickStartPackages } from "@/types";
import type { InstanceDetail as InstanceDetailInfo } from "@/types/instance";
import { defaultDockerConfig, defaultQuickStartPackages, TERMINAL_CODE } from "@/types/instanceDefaults";
import DockerImageSelect from "./components/DockerImageSelect";
import "./InstanceDetail.scss";

type GpuMode = "all" | "count" | "deviceIds";

interface ItemProps {
  title: ReactNode;
  desc?: string;
  /** Rendered description when it is not plain text (HTML from a translation). */
  descNode?: ReactNode;
  required?: boolean;
  children: ReactNode;
}

/** Title, one-line help text with the full text in a tooltip, then the control (upstream layout). */
function Item({ title, desc, descNode, required, children }: ItemProps) {
  const cls = "typography-text-ellipsis";
  return (
    <div className="ant-form-item" style={{ marginBottom: 24 }}>
      <Typography.Title level={5} className={required ? "require-field" : undefined}>
        {title}
      </Typography.Title>
      {(desc || descNode) && (
        <Typography.Paragraph>
          {descNode ? (
            <Typography.Text type="secondary" className={cls}>
              {descNode}
            </Typography.Text>
          ) : (
            <Tooltip title={desc} placement="top">
              <Typography.Text type="secondary" className={cls}>
                {desc}
              </Typography.Text>
            </Tooltip>
          )}
        </Typography.Paragraph>
      )}
      {children}
    </div>
  );
}

const splitList = (text: string) =>
  text
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");

const splitKv = (v: string, sep: string) => {
  const parts = v.split(sep);
  return { label: parts.shift() || "", value: parts.join(sep) || "" };
};

/** Options for the market editor's template mode. */
export interface TemplateEditOptions {
  /** Existing template to edit; omitted for a new one. */
  item?: QuickStartPackages;
  gameTypeList?: FilterOption[];
  platformList?: FilterOption[];
  categoryList?: FilterOption[];
  languageOptions?: FilterOption[];
}

type Props =
  | { mode: "instance"; info: InstanceDetailInfo; instanceId: string; daemonId: string; done: (saved: boolean) => void }
  | ({ mode: "template"; done: (template: QuickStartPackages | undefined) => void } & TemplateEditOptions);

const isChinese = () => {
  const lang = getCurrentLang();
  return lang === "zh_cn" || lang === "zh_tw" || window.navigator.language.includes("zh");
};

const EMPTY_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1700' height='800' viewBox='0 0 170 80'%3E%3Crect width='1700' height='800' fill='%230044ff' fill-opacity='0.1'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='20' fill='%23ffffff80'%3EEmpty%3C/text%3E%3C/svg%3E";

/** Select whose dropdown can add a new free-text option (upstream dropdownRender + addOption). */
function AddableSelect({ value, options, onChange }: { value?: string; options: FilterOption[]; onChange: (v: string) => void }) {
  const [extra, setExtra] = useState<FilterOption[]>([]);
  const [text, setText] = useState("");
  const all = [...options.filter((o) => o.value !== SEARCH_ALL_KEY), ...extra];
  return (
    <Select
      style={{ width: "100%" }}
      value={value || undefined}
      showSearch={{ optionFilterProp: "label" }}
      placeholder={t("TXT_CODE_3bb646e4")}
      options={all}
      onChange={onChange}
      popupRender={(menu) => (
        <>
          {menu}
          <Divider style={{ margin: "4px 0" }} />
          <Space style={{ padding: "4px 8px" }}>
            <Input value={text} size="middle" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            <Button
              type="text"
              icon={<PlusOutlined />}
              onClick={() => {
                if (!text) return;
                setExtra((x) => [...x, { label: text, value: text }]);
                setText("");
              }}
            >
              {t("TXT_CODE_a1d885c1")}
            </Button>
          </Space>
        </>
      )}
    />
  );
}

function InstanceDetailDialog(props: Props) {
  const isTemplate = props.mode === "template";
  const info: InstanceDetailInfo | undefined = props.mode === "instance" ? props.info : undefined;
  const instanceId = props.mode === "instance" ? props.instanceId : "";
  const daemonId = props.mode === "instance" ? props.daemonId : "";
  // "Run as": Web Admins only, and for host processes only on a daemon running as root.
  const isWebAdmin = useIsWebAdmin();
  const nodeRunAs = useNodeRunAs(daemonId);
  const { message } = App.useApp();
  const { isPhone } = useScreen();
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [tpl, setTpl] = useState<QuickStartPackages>(() => {
    if (props.mode !== "template") return structuredClone(defaultQuickStartPackages);
    if (props.item) {
      const item = structuredClone(props.item);
      if (!item.setupInfo) item.setupInfo = structuredClone(defaultQuickStartPackages.setupInfo);
      if (!item.setupInfo.docker) item.setupInfo.docker = structuredClone(defaultQuickStartPackages.setupInfo.docker);
      return item;
    }
    return { ...structuredClone(defaultQuickStartPackages), language: isChinese() ? "zh_cn" : "en_us" };
  });
  const setTplField = (patch: Partial<QuickStartPackages>) => setTpl((x) => ({ ...x, ...patch }));
  // An instance whose daemon sent no config gets an empty form and a notice instead of a crash (upstream TXT_CODE_2dae1294).
  const missingConfig = !!info && !info.config;
  const sourceConfig: IGlobalInstanceConfig = info ? (info.config ?? ({} as IGlobalInstanceConfig)) : tpl.setupInfo;
  const [cfg, setCfg] = useState<IGlobalInstanceConfig>(() => {
    const c = structuredClone(sourceConfig);
    c.docker = { ...structuredClone(defaultDockerConfig), ...(c.docker ?? {}) };
    return c;
  });
  const [templateErrors, setTemplateErrors] = useState(false);
  const [endTime, setEndTime] = useState<Dayjs | undefined | null>(() => timestampToDayjs(sourceConfig.endTime));
  const [aliasesText, setAliasesText] = useState(sourceConfig.docker?.networkAliases?.join(",") || "");
  const [readBpsText, setReadBpsText] = useState(sourceConfig.docker?.deviceReadBps?.join(",") || "");
  const [writeBpsText, setWriteBpsText] = useState(sourceConfig.docker?.deviceWriteBps?.join(",") || "");
  const [gpuIdsText, setGpuIdsText] = useState(sourceConfig.docker?.gpuDeviceIds?.join(",") || "");
  const [gpuMode, setGpuMode] = useState<GpuMode>(() => {
    const d = sourceConfig.docker;
    if (d?.gpuDeviceIds?.length) return "deviceIds";
    if (typeof d?.gpuCount === "number" && d.gpuCount >= 1) return "count";
    return "all";
  });
  const [imageMethod, setImageMethod] = useState<"SELECT" | "EDIT">("SELECT");
  const [networkModes, setNetworkModes] = useState<DockerNetworkModes[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const isGlobal = !!info && info.config?.nickname === GLOBAL_INSTANCE_NAME;
  const isDocker = cfg.processType === "docker";
  const linkedAccount = cfg.osAccount || "";
  const runAsState = runAsFieldState({ isWebAdmin, isGlobal, isDocker, info: nodeRunAs, linkedAccount });
  const runAsPlaceholder = nodeRunAs?.defaultUser && !isDocker ? t("TXT_CODE_RUNAS_DEFAULT_USER", { user: nodeRunAs.defaultUser }) : t("TXT_CODE_9aa83c05");
  const docker = cfg.docker;
  const set = (patch: Partial<IGlobalInstanceConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const setDocker = (patch: Partial<IGlobalInstanceDockerConfig>) => setCfg((c) => ({ ...c, docker: { ...c.docker, ...patch } }));

  const close = (saved: boolean) => {
    setOpen(false);
    if (props.mode === "instance") props.done(saved);
    else props.done(undefined);
  };

  const loadNetworkModes = async () => {
    try {
      setNetworkModes((await getNetworkModeList({ params: { daemonId } })) ?? []);
    } catch {
      /* daemon without Docker */
    }
  };

  const onGpuModeChange = (mode: GpuMode) => {
    setGpuMode(mode);
    if (mode === "all") setDocker({ gpuCount: -1, gpuDeviceIds: [] });
    if (mode === "count") setDocker({ gpuCount: 1, gpuDeviceIds: [] });
    if (mode === "deviceIds") setDocker({ gpuCount: 0 });
    if (mode !== "deviceIds") setGpuIdsText("");
  };

  /** Same checks as the upstream form rules; the first failure is reported. */
  const validate = (): string | null => {
    if (!isTemplate && !String(cfg.nickname ?? "").trim()) return t("TXT_CODE_68a504b3");
    if (String(cfg.startCommand ?? "").includes("\n")) return t("TXT_CODE_bbbda29");
    if (!isTemplate && !String(cfg.cwd ?? "").trim()) return t("TXT_CODE_71c948a9");
    const port = Number(cfg.basePort);
    if (cfg.basePort && (Number.isNaN(port) || port < 0 || port > 65535)) return t("TXT_CODE_12040bf0");
    if (isDocker && !docker.image) return imageMethod === "EDIT" ? t("TXT_CODE_9fed23ab") : t("TXT_CODE_be6484f7");
    if (isDocker && docker.networkMode === "") return t("TXT_CODE_b52cb76c");
    return null;
  };

  const encode = (): IGlobalInstanceConfig => {
    const c = structuredClone(cfg);
    c.endTime = dayjsToTimestamp(endTime ?? undefined);
    c.docker.networkAliases = splitList(aliasesText);
    c.docker.deviceReadBps = splitList(readBpsText);
    c.docker.deviceWriteBps = splitList(writeBpsText);
    if (gpuMode === "deviceIds") {
      c.docker.gpuDeviceIds = splitList(gpuIdsText);
      c.docker.gpuCount = 0;
    } else if (gpuMode === "all") {
      c.docker.gpuCount = -1;
      c.docker.gpuDeviceIds = [];
    } else {
      c.docker.gpuDeviceIds = [];
    }
    if (!c.docker.gpuEnabled) {
      c.docker.gpuCount = -1;
      c.docker.gpuDeviceIds = [];
    }
    return c;
  };

  /** Template tab rules (upstream formRules.template); the first missing field is reported. */
  const validateTemplate = (): string | null => {
    const required: [keyof QuickStartPackages, string][] = [
      ["image", "TXT_CODE_c11ac499"],
      ["title", "TXT_CODE_6b5509c7"],
      ["description", "TXT_CODE_8d6c8ae7"],
      ["language", "TXT_CODE_60752a40"],
      ["author", "TXT_CODE_f6d73056"],
      ["gameType", "TXT_CODE_f0694685"],
      ["platform", "TXT_CODE_46039f9b"],
      ["category", "TXT_CODE_b2391fca"],
      ["runtime", "TXT_CODE_8717ed9d"],
      ["hardware", "TXT_CODE_f7909939"]
    ];
    for (const [key, msg] of required) if (!String(tpl[key] ?? "").trim()) return t(msg);
    if (!cfg.type) return t("TXT_CODE_9f4eaa41");
    return null;
  };

  const submit = async () => {
    if (props.mode === "template") {
      const error = validateTemplate() ?? validate();
      if (error) {
        setTemplateErrors(true);
        setShowErrors(true);
        return void reportErrorMsg(error);
      }
      props.done({ ...structuredClone(tpl), setupInfo: encode() });
      setOpen(false);
      message.success(props.item ? t("TXT_CODE_a7907771") : t("TXT_CODE_d28c05df"));
      return;
    }
    const error = validate();
    if (error) {
      setShowErrors(true);
      return void reportErrorMsg(error);
    }
    setLoading(true);
    try {
      await updateAnyInstanceConfig({ params: { uuid: instanceId, daemonId }, data: encode() });
      message.success(t("TXT_CODE_d3de39b4"));
      close(true);
    } catch (err) {
      reportErrorMsg(err instanceof Error ? err : t("TXT_CODE_9911ac11"));
    } finally {
      setLoading(false);
    }
  };

  const editDocker = async (type: "port" | "volume" | "env" | "label" | "device" | "capability") => {
    if (type === "port") {
      const result = await openPortEditDialog(dockerPortsArray(docker.ports || []));
      setDocker({ ports: result.map((v) => `${v.host}:${v.container}/${v.protocol}`) });
    }
    if (type === "volume") {
      const rows = (docker.extraVolumes || []).map((v) => {
        const [host = "", container = ""] = v.split("|");
        return { host, container };
      });
      const result = await openVolumeEditDialog(rows);
      setDocker({ extraVolumes: result.map((v) => `${v.host}|${v.container}`) });
    }
    if (type === "env") {
      const result = await openDockerEnvEditDialog((docker.env || []).map((v) => splitKv(v, "=")));
      setDocker({ env: result.map((v) => `${v.label}=${v.value}`) });
    }
    if (type === "label") {
      const result = await openDockerLabelEditDialog((docker.labels || []).map((v) => splitKv(v, "=")));
      setDocker({ labels: result.map((v) => `${v.label}=${v.value}`) });
    }
    if (type === "capability") {
      const capAdd = docker.capAdd || [];
      const capDrop = docker.capDrop || [];
      const all = [...new Set([...capAdd, ...capDrop])];
      const result = await openDockerCapabilityEditDialog(all.map((label) => ({ label, value: capAdd.includes(label) ? "add" : "drop" })));
      setDocker({ capAdd: result.filter((i) => i.value === "add").map((i) => i.label), capDrop: result.filter((i) => i.value === "drop").map((i) => i.label) });
    }
    if (type === "device") {
      const rows = (docker.devices || []).map((v) => {
        const [PathOnHost = "", PathInContainer = "", CgroupPermissions = ""] = v.split("|");
        return { PathOnHost, PathInContainer, CgroupPermissions };
      });
      const result = await openDockerDeviceEditDialog(rows);
      const devices = result
        .map((v) => {
          if (!v.PathOnHost) return "";
          if (!v.PathInContainer && !v.CgroupPermissions) return v.PathOnHost;
          if (!v.CgroupPermissions) return `${v.PathOnHost}|${v.PathInContainer}`;
          return `${v.PathOnHost}|${v.PathInContainer}|${v.CgroupPermissions}`;
        })
        .filter(Boolean);
      setDocker({ devices });
    }
  };

  const editButton = (type: Parameters<typeof editDocker>[0]) => (
    <Button type="default" onClick={() => void editDocker(type)}>
      {t("TXT_CODE_ad207008")}
    </Button>
  );
  const err = (bad: boolean) => (showErrors && bad ? ("error" as const) : undefined);
  const typeOptions = Object.entries(instanceTypeTranslation()).map(([value, label]) => ({ value, label }));
  const codeOptions = TERMINAL_CODE.map((v) => ({ value: v, label: v }));
  const numText = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  // Upstream binds these number fields to plain inputs and sends what was typed.
  const numInput = (key: keyof IGlobalInstanceDockerConfig, placeholder: string, suffix?: string, tip?: string) => {
    const input = (
      <Input
        allowClear
        value={numText(docker[key])}
        placeholder={placeholder}
        suffix={suffix}
        onChange={(e) => setDocker({ [key]: e.target.value } as Partial<IGlobalInstanceDockerConfig>)}
      />
    );
    return tip ? (
      <Tooltip placement="bottom" title={tip}>
        {input}
      </Tooltip>
    ) : (
      input
    );
  };
  const updateCmdTemplate = t("TXT_CODE_61ca492b") + '"C:/SteamCMD/steamcmd.exe" +login anonymous +force_install_dir "{mcsm_workspace}" "+app_update 380870 validate" +quit';

  const basicTab = (
    <Row gutter={20}>
      {!isTemplate && (
      <>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_f70badb9")} desc={t("TXT_CODE_818928ba")} required>
          <Input value={cfg.nickname} status={err(!String(cfg.nickname ?? "").trim())} disabled={isGlobal} onChange={(e) => set({ nickname: e.target.value })} />
        </Item>
      </Col>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_2f291d8b")} desc={t("TXT_CODE_be608c82")} required>
          <Select style={{ width: "100%" }} value={cfg.type} placeholder={t("TXT_CODE_3bb646e4")} disabled={isGlobal} options={typeOptions} onChange={(v) => set({ type: v })} />
        </Item>
      </Col>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_fa920c0")} desc={t("TXT_CODE_b029a155")}>
          <DatePicker value={endTime} size="large" showTime style={{ width: "100%" }} placeholder={t("TXT_CODE_e3a77a77")} disabled={isGlobal} onChange={(v) => setEndTime(v)} />
        </Item>
      </Col>
      </>
      )}
      <Col xs={24}>
        <Item
          title={t("TXT_CODE_d12fa808")}
          descNode={
            <span className="typography-text-ellipsis">
              <SafeHtml html={t("TXT_CODE_A0000001")} />
            </span>
          }
        >
          {/* Johnnykins fork: the command assistant button beside the field. */}
          <Space.Compact block style={{ display: "flex" }}>
            <Input.TextArea
              value={cfg.startCommand}
              rows={5}
              style={{ minHeight: 40 }}
              status={err(String(cfg.startCommand ?? "").includes("\n"))}
              placeholder={isDocker ? t("TXT_CODE_98e7c829") : t("TXT_CODE_f50cfe2")}
              onChange={(e) => set({ startCommand: e.target.value })}
            />
            <Button style={{ height: "auto" }} onClick={() => void openCmdAssistantDialog().then((cmd) => cmd && set({ startCommand: cmd }))}>
              {t("TXT_CODE_2728d0d4")}
            </Button>
          </Space.Compact>
        </Item>
      </Col>
      <Col xs={24} md={12}>
        <Item title={t("TXT_CODE_11cfe3a1")} desc={t("TXT_CODE_7ec7ccb8")}>
          <Input value={cfg.stopCommand} placeholder={t("TXT_CODE_83053cd5")} onChange={(e) => set({ stopCommand: e.target.value })} />
        </Item>
      </Col>
      <Col xs={24} md={12}>
        <Item title={t("TXT_CODE_f26ad72e")} desc={t("TXT_CODE_62232876")}>
          <InputNumber value={cfg.stopTimeout} size="large" min={0} max={86400} step={1} precision={0} style={{ width: "100%" }} onChange={(v) => set({ stopTimeout: v ?? 0 })} />
        </Item>
      </Col>
    </Row>
  );

  const advancedTab = (
    <Row gutter={20}>
      {!isTemplate && (
        <Col xs={24}>
          <Item title={t("TXT_CODE_ee67e1a3")} desc={t("TXT_CODE_962d9320")} required>
            <Input value={cfg.cwd} status={err(!String(cfg.cwd ?? "").trim())} onChange={(e) => set({ cwd: e.target.value })} />
          </Item>
        </Col>
      )}
      <Col xs={24}>
        <Item
          title={t("TXT_CODE_bb0b9711")}
          descNode={
            <>
              <span>{t("TXT_CODE_4f387c5a")}</span>
              <br />
              <SafeHtml html={t("TXT_CODE_fa487a47")} />
            </>
          }
        >
          <Input value={cfg.updateCommand} placeholder={updateCmdTemplate} disabled={isGlobal} onChange={(e) => set({ updateCommand: e.target.value })} />
        </Item>
      </Col>
      <Col xs={24} lg={12}>
        <Item title={t("TXT_CODE_a3bcd4b5")} desc={t("TXT_CODE_3bbdf523")}>
          <DockerImageSelect
            allowEmpty
            allowEmptyText={t("TXT_CODE_8aca7994")}
            allowHost
            allowHostText={t("TXT_CODE_update_cmd_no_image")}
            value={docker.updateCommandImage ?? "HOST"}
            daemonId={daemonId}
            onChange={(v) => setDocker({ updateCommandImage: v })}
          />
        </Item>
      </Col>
      <Col xs={24} lg={6}>
        <Item title={t("TXT_CODE_f041de90")} desc={t("TXT_CODE_6e69b5a5")} required>
          <Select style={{ width: "100%" }} value={cfg.fileCode} placeholder={t("TXT_CODE_3bb646e4")} options={codeOptions} onChange={(v) => set({ fileCode: v })} />
        </Item>
      </Col>
      <Col xs={24} lg={6}>
        <Item
          title={t("TXT_CODE_fffaeb17")}
          descNode={
            <Tooltip title={<span style={{ whiteSpace: "pre-wrap" }}>{t("TXT_CODE_fffaeb18") + "\n" + t("TXT_CODE_50a2b2d9")}</span>}>
              <span>{t("TXT_CODE_fffaeb18")}</span>
            </Tooltip>
          }
        >
          {runAsState.kind === "edit" && runAsState.options ? (
            <Select
              style={{ width: "100%" }}
              allowClear
              value={cfg.runAs || undefined}
              placeholder={runAsPlaceholder}
              options={runAsState.options.map((u) => ({ label: u, value: u }))}
              onChange={(v) => set({ runAs: v ?? "" })}
            />
          ) : (
            <Input
              value={runAsState.kind === "locked" && runAsState.reason === "linked" ? linkedAccount : cfg.runAs}
              placeholder={runAsPlaceholder}
              disabled={runAsState.kind === "locked"}
              onChange={(e) => set({ runAs: e.target.value })}
            />
          )}
          {runAsState.kind === "locked" && runAsState.reason !== "global" && (
            <Typography.Text type={runAsState.reason === "not-root" && cfg.runAs ? "warning" : "secondary"} style={{ fontSize: 12 }}>
              {runAsState.reason === "linked"
                ? t("TXT_CODE_OSACCOUNT_LINKED_POSIX", { account: linkedAccount })
                : runAsState.reason === "not-web-admin"
                  ? t("TXT_CODE_RUNAS_WEBADMIN_ONLY")
                  : runAsState.reason === "windows"
                    ? t("TXT_CODE_RUNAS_WINDOWS")
                    : cfg.runAs
                      ? t("TXT_CODE_RUNAS_NOT_ROOT_SET")
                      : t("TXT_CODE_RUNAS_NOT_ROOT")}
            </Typography.Text>
          )}
          {linkedAccount && nodeRunAs?.platform === "win32" && !isGlobal && (
            <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
              {t("TXT_CODE_OSACCOUNT_LINKED_WINDOWS", { account: linkedAccount })}
            </Typography.Text>
          )}
        </Item>
      </Col>
    </Row>
  );

  const onOffSwitch = (checked: boolean, onChange: (v: boolean) => void) => (
    <div className="ml-4">
      <Switch checked={checked} disabled={isGlobal} checkedChildren={<CheckOutlined />} unCheckedChildren={<CloseOutlined />} onChange={onChange} />
    </div>
  );

  const dockerTab = (
    <Row gutter={20}>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_61a8296e")} desc={t("TXT_CODE_2b221e02")}>
          {onOffSwitch(isDocker, (v) => set({ processType: v ? "docker" : "general" }))}
        </Item>
      </Col>
      {isDocker && (
        <>
          <Col xs={24} lg={16}>
            <Item
              title={imageMethod === "SELECT" ? t("TXT_CODE_6904cb3") : t("TXT_CODE_4e4d9680")}
              desc={imageMethod === "SELECT" ? t("TXT_CODE_ec734b5c") : t("TXT_CODE_4a570d32")}
              required
            >
              <DockerImageSelect value={docker.image ?? ""} daemonId={daemonId} status={err(!docker.image)} onChange={(v) => setDocker({ image: v })} onMethodChange={setImageMethod} />
            </Item>
          </Col>
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_5484094a")} desc={t("TXT_CODE_60dd05d5")} required>
              {onOffSwitch(!!docker.changeWorkdir, (v) => setDocker({ changeWorkdir: v }))}
            </Item>
          </Col>
          <Col xs={24} lg={16}>
            <Item title={t("TXT_CODE_81979d0f")} desc={t("TXT_CODE_c800cb31")}>
              <Input value={docker.workingDir} placeholder={t("TXT_CODE_2082f659")} onChange={(e) => setDocker({ workingDir: e.target.value })} />
            </Item>
          </Col>
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_d9c73520")} desc={t("TXT_CODE_828ea87f")}>
              {editButton("volume")}
            </Item>
          </Col>
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_cf88c936")} desc={t("TXT_CODE_1a37f514")}>
              {editButton("port")}
            </Item>
          </Col>
          {!isTemplate && (
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_15f5fb07")} desc={t("TXT_CODE_dfd06954")}>
              <Input
                value={numText(cfg.basePort)}
                status={err(!!cfg.basePort && (Number(cfg.basePort) < 0 || Number(cfg.basePort) > 65535))}
                placeholder={t("TXT_CODE_3bb646e4")}
                disabled={isGlobal}
                onChange={(e) => set({ basePort: e.target.value as unknown as number })}
              />
            </Item>
          </Col>
          )}
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_b916a8dc")} desc={t("TXT_CODE_33ce1c5c")}>
              {editButton("env")}
            </Item>
          </Col>
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_g1c43s2h")} desc={t("TXT_CODE_MimBB1Ea")}>
              {editButton("label")}
            </Item>
          </Col>
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_efcef926")} desc={t("TXT_CODE_38a430d8")} required>
              <Select
                value={docker.networkMode}
                size="large"
                style={{ width: "100%" }}
                status={err(docker.networkMode === "")}
                placeholder={t("TXT_CODE_3bb646e4")}
                options={networkModes.map((m) => ({ value: m.Name, label: m.Name }))}
                onFocus={() => void loadNetworkModes()}
                onChange={(v) => setDocker({ networkMode: v })}
              />
            </Item>
          </Col>
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_10194e6a")} desc={t("TXT_CODE_97655c5d")}>
              <Input value={aliasesText} placeholder={t("TXT_CODE_8d4882b0")} onChange={(e) => setAliasesText(e.target.value)} />
            </Item>
          </Col>
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_c3a3b6b1")} desc={t("TXT_CODE_d1c78fbf")}>
              <Tooltip placement="bottom" title={t("TXT_CODE_8d4882b0")}>
                <Input value={docker.containerName} placeholder={t("TXT_CODE_f6047384")} onChange={(e) => setDocker({ containerName: e.target.value })} />
              </Tooltip>
            </Item>
          </Col>
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_dc47d2aa")} desc={t("TXT_CODE_18437e81")}>
              {onOffSwitch(!!docker.privileged, (v) => setDocker({ privileged: v }))}
            </Item>
          </Col>
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_bbbd4133")} desc={t("TXT_CODE_377319df")}>
              {editButton("capability")}
            </Item>
          </Col>
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_b3a60c78")} desc={t("TXT_CODE_b6e18b87")}>
              {editButton("device")}
            </Item>
          </Col>
        </>
      )}
    </Row>
  );

  const limitTab = (
    <Row gutter={20}>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_53046822")} desc={t("TXT_CODE_750ab5c6")}>
          {numInput("cpuUsage", t("TXT_CODE_91d857f5"), "%", t("TXT_CODE_dce87e42"))}
        </Item>
      </Col>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_b0c4e4ae")} desc={t("TXT_CODE_2b9e9b5")}>
          {numInput("cpusetCpus", t("TXT_CODE_30fe1717"), undefined, t("TXT_CODE_67c765be"))}
        </Item>
      </Col>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_6fe24924")} desc={t("TXT_CODE_a0d214ac")}>
          {numInput("memory", t("TXT_CODE_80790069"), "MB")}
        </Item>
      </Col>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_a68b3a9c")} desc={t("TXT_CODE_b946a322")}>
          {numInput("memorySwap", t("TXT_CODE_6f1129fb"))}
        </Item>
      </Col>
      <Col xs={24} lg={8}>
        <Item
          title={
            <>
              {t("TXT_CODE_ca61b504")} <Tag color="blue">{t("TXT_CODE_33d7a685")}</Tag>
            </>
          }
          desc={t("TXT_CODE_d86fbff5")}
        >
          {numInput("maxSpace", t("TXT_CODE_285cef0c"), "GB")}
        </Item>
      </Col>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_5c43374f")} desc={t("TXT_CODE_a7885cbc")}>
          {numInput("memorySwappiness", t("TXT_CODE_6f1129fb"))}
        </Item>
      </Col>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_network_upload_limit")} desc={t("TXT_CODE_network_upload_limit_help")}>
          {numInput("uploadSpeedLimit", t("TXT_CODE_network_upload_limit_placeholder"), "KB/s")}
        </Item>
      </Col>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_network_download_limit")} desc={t("TXT_CODE_network_download_limit_help")}>
          {numInput("downloadSpeedLimit", t("TXT_CODE_network_download_limit_placeholder"), "KB/s")}
        </Item>
      </Col>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_59653f38")} desc={t("TXT_CODE_edbb92dc")}>
          <Input value={readBpsText} placeholder={t("TXT_CODE_6542489a")} onChange={(e) => setReadBpsText(e.target.value)} />
        </Item>
      </Col>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_9d2e6d5e")} desc={t("TXT_CODE_2b2ff3ff")}>
          <Input value={writeBpsText} placeholder={t("TXT_CODE_f0dc9eca")} onChange={(e) => setWriteBpsText(e.target.value)} />
        </Item>
      </Col>
      <Col xs={24}>
        <Divider titlePlacement="start">{t("TXT_CODE_gpu_section_title")}</Divider>
      </Col>
      <Col xs={24} lg={8}>
        <Item title={t("TXT_CODE_gpu_enable")} desc={t("TXT_CODE_gpu_enable_help")}>
          <Switch
            checked={!!docker.gpuEnabled}
            checkedChildren={t("TXT_CODE_gpu_enabled")}
            unCheckedChildren={t("TXT_CODE_gpu_disabled")}
            onChange={(v) => setDocker({ gpuEnabled: v })}
          />
        </Item>
      </Col>
      {docker.gpuEnabled && (
        <>
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_gpu_driver")} desc={t("TXT_CODE_gpu_driver_help")}>
              <Input value={docker.gpuDriver} placeholder={t("TXT_CODE_gpu_driver_placeholder")} onChange={(e) => setDocker({ gpuDriver: e.target.value })} />
            </Item>
          </Col>
          <Col xs={24} lg={8}>
            <Item title={t("TXT_CODE_gpu_alloc_mode")} desc={t("TXT_CODE_gpu_alloc_mode_help")}>
              <Radio.Group value={gpuMode} onChange={(e) => onGpuModeChange(e.target.value)}>
                <Radio.Button value="all">{t("TXT_CODE_gpu_alloc_all")}</Radio.Button>
                <Radio.Button value="count">{t("TXT_CODE_gpu_alloc_count")}</Radio.Button>
                <Radio.Button value="deviceIds">{t("TXT_CODE_gpu_alloc_device_ids")}</Radio.Button>
              </Radio.Group>
            </Item>
          </Col>
          {gpuMode === "count" && (
            <Col xs={24} lg={8}>
              <Item title={t("TXT_CODE_gpu_count")} desc={t("TXT_CODE_gpu_count_help")}>
                <InputNumber
                  value={docker.gpuCount}
                  min={1}
                  max={128}
                  precision={0}
                  style={{ width: "100%" }}
                  placeholder={t("TXT_CODE_gpu_count_placeholder")}
                  onChange={(v) => setDocker({ gpuCount: v ?? 1 })}
                />
              </Item>
            </Col>
          )}
          {gpuMode === "deviceIds" && (
            <Col xs={24} lg={16}>
              <Item title={t("TXT_CODE_gpu_device_ids")} desc={t("TXT_CODE_gpu_device_ids_help")}>
                <Input value={gpuIdsText} placeholder={t("TXT_CODE_gpu_device_ids_placeholder")} onChange={(e) => setGpuIdsText(e.target.value)} />
              </Item>
            </Col>
          )}
        </>
      )}
    </Row>
  );

  const terr = (bad: boolean) => (templateErrors && bad ? ("error" as const) : undefined);
  const tplImage = safeHttpUrl(tpl.image);
  const templateTab =
    props.mode === "template" ? (
      <>
        <Row gutter={20}>
          <Col span={24} sm={24} md={12}>
            <Item title={t("TXT_CODE_80c5409f")} required>
              <Image
                fallback={EMPTY_IMAGE}
                className="cursor-pointer"
                style={{ borderRadius: 8 }}
                width="100%"
                src={tplImage ?? EMPTY_IMAGE}
                placeholder={false}
                preview={false}
                referrerPolicy="no-referrer"
                onClick={async () => {
                  const url = await openUploadFileDialog();
                  if (url) setTplField({ image: url });
                }}
              />
              <Input value={tpl.image} className="mt-10" status={terr(!tpl.image)} placeholder={t("TXT_CODE_99a42341")} onChange={(e) => setTplField({ image: e.target.value })} />
            </Item>
          </Col>
          <Col span={24} sm={24} md={12}>
            <Item title={t("TXT_CODE_f4fba0cd")} required>
              <Input value={tpl.title} status={terr(!tpl.title)} placeholder={t("TXT_CODE_6b5509c7")} onChange={(e) => setTplField({ title: e.target.value })} />
            </Item>
            <Item title={t("TXT_CODE_59cdbec3")} required>
              <Input.TextArea
                value={tpl.description}
                status={terr(!tpl.description)}
                placeholder={t("TXT_CODE_98dbd049")}
                allowClear
                size="large"
                autoSize={{ minRows: 1 }}
                onChange={(e) => setTplField({ description: e.target.value })}
              />
            </Item>
            <Row gutter={20}>
              <Col span={24} lg={12}>
                <Item title={t("TXT_CODE_2a34c50a")} required>
                  <Select
                    style={{ width: "100%" }}
                    value={tpl.language || undefined}
                    status={terr(!tpl.language)}
                    placeholder={t("TXT_CODE_60752a40")}
                    options={props.languageOptions ?? []}
                    onChange={(language) => setTplField({ language })}
                  />
                </Item>
              </Col>
              <Col span={24} lg={12}>
                <Item title={t("TXT_CODE_3d56da34")} required>
                  <Input value={tpl.author} status={terr(!tpl.author)} placeholder={t("TXT_CODE_e6adf32d")} onChange={(e) => setTplField({ author: e.target.value })} />
                </Item>
              </Col>
            </Row>
          </Col>
        </Row>
        <Row gutter={20}>
          <Col span={24} sm={12} lg={6}>
            <Item title={t("TXT_CODE_c5ace40b")} required>
              <Select style={{ width: "100%" }} value={cfg.type} placeholder={t("TXT_CODE_3bb646e4")} showSearch={{ optionFilterProp: "label" }} options={typeOptions} onChange={(v) => set({ type: v })} />
            </Item>
          </Col>
          <Col span={24} sm={12} lg={6}>
            <Item title={t("TXT_CODE_ebfb4831")} required>
              <AddableSelect value={tpl.gameType} options={props.gameTypeList ?? []} onChange={(gameType) => setTplField({ gameType })} />
            </Item>
          </Col>
          <Col span={24} sm={12} lg={6}>
            <Item title={t("TXT_CODE_1ce1d1d1")} required>
              <AddableSelect value={tpl.platform} options={props.platformList ?? []} onChange={(platform) => setTplField({ platform })} />
            </Item>
          </Col>
          <Col span={24} sm={12} lg={6}>
            <Item title={t("TXT_CODE_2d8a400")} required>
              <AddableSelect value={tpl.category} options={props.categoryList ?? []} onChange={(category) => setTplField({ category })} />
            </Item>
          </Col>
        </Row>
        <Row gutter={20}>
          <Col span={24} sm={12} lg={8}>
            <Item title={t("TXT_CODE_80c85070")} required>
              <Input value={tpl.runtime} status={terr(!tpl.runtime)} placeholder={t("TXT_CODE_772bb48a")} onChange={(e) => setTplField({ runtime: e.target.value })} />
            </Item>
          </Col>
          <Col span={24} sm={12} lg={8}>
            <Item title={t("TXT_CODE_683e3033")} required>
              <Input value={tpl.hardware} status={terr(!tpl.hardware)} placeholder={t("TXT_CODE_d79ff710")} onChange={(e) => setTplField({ hardware: e.target.value })} />
            </Item>
          </Col>
          <Col span={24} sm={12} lg={8}>
            <Item title={t("TXT_CODE_8dbcf565")}>
              <Input value={tpl.size} placeholder="Example: 1024MB, 1GB" allowClear onChange={(e) => setTplField({ size: e.target.value })} />
            </Item>
          </Col>
        </Row>
        <Item title={t("TXT_CODE_13eac7e1")}>
          <Input value={tpl.targetLink} placeholder={t("TXT_CODE_8d83752")} onChange={(e) => setTplField({ targetLink: e.target.value })} />
        </Item>
        <Item title={t("TXT_CODE_9901af98")}>
          <Select style={{ width: "100%" }} value={tpl.tags} mode="tags" placeholder={t("TXT_CODE_7d839745")} tokenSeparators={[","]} onChange={(tags) => setTplField({ tags })} />
        </Item>
      </>
    ) : null;

  const tabs = [
    ...(templateTab ? [{ key: "template", label: t("TXT_CODE_d9c63fdd"), children: templateTab }] : []),
    { key: "basic", label: t("TXT_CODE_cc7b54b9"), children: basicTab },
    { key: "advanced", label: t("TXT_CODE_31a1d824"), children: advancedTab },
    ...(isGlobal
      ? []
      : [
          { key: "docker", label: t("TXT_CODE_afb12200"), children: dockerTab },
          { key: "limit", label: t("TXT_CODE_604d8d63"), children: limitTab }
        ])
  ];

  return (
    <Modal
      open={open}
      centered
      mask={{ closable: false }}
      width={isPhone ? "100%" : 1200}
      title={isTemplate ? (props.mode === "template" && props.item ? t("TXT_CODE_921206fc") : t("TXT_CODE_3d45d8d")) : t("TXT_CODE_aac98b2a")}
      confirmLoading={loading}
      okText={t("TXT_CODE_abfe9512")}
      onOk={() => void submit()}
      okButtonProps={{ disabled: missingConfig }}
      onCancel={() => close(false)}
    >
      <div className="dialog-overflow-container">
        {!isTemplate && (
          <Tooltip title={t("TXT_CODE_cdf7c16a")} placement="top">
            <Typography.Text type="secondary" className="typography-text-ellipsis">
              {t("TXT_CODE_cdf7c16a")}
            </Typography.Text>
          </Tooltip>
        )}
        {missingConfig ? (
          <Typography.Title level={5}>{t("TXT_CODE_2dae1294")}.</Typography.Title>
        ) : (
          <Tabs defaultActiveKey={isTemplate ? "template" : "basic"} items={tabs} />
        )}
      </div>
    </Modal>
  );
}

export const openInstanceDetailDialog = (info: InstanceDetailInfo, instanceId: string, daemonId: string) =>
  openDialog<boolean>((done) => <InstanceDetailDialog mode="instance" info={info} instanceId={instanceId} daemonId={daemonId} done={done} />);

/** Market editor: edit (or create) a template; resolves with the edited copy, or undefined on cancel. */
export const openTemplateEditDialog = (options: TemplateEditOptions) =>
  openDialog<QuickStartPackages | undefined>((done) => <InstanceDetailDialog mode="template" {...options} done={done} />);
