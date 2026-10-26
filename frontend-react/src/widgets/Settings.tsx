/**
 * Panel settings page (port of widgets/Settings.vue), plus a "Daemon
 * Passport" pane for the Johnnykins passport switches.
 *
 * SECURITY: the settings API never returns secrets (gatewaySecret, SSO client
 * secret, passport keys); an empty SSO secret on save keeps the stored one.
 * Every value is validated again by the panel (settings_router.ts); the form
 * limits here are for usability only.
 */
import {
  ApiOutlined,
  BankOutlined,
  BookOutlined,
  BugOutlined,
  CloudUploadOutlined,
  EditOutlined,
  FileProtectOutlined,
  GithubOutlined,
  LockOutlined,
  MessageOutlined,
  MoneyCollectOutlined,
  PicLeftOutlined,
  PlusOutlined,
  ProjectOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SecurityScanOutlined
} from "@ant-design/icons";
import { Alert, App, Button, Checkbox, Form, Input, InputNumber, Select, Tag, Typography } from "antd";
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import CardPanel from "@/components/CardPanel";
import { openUploadFileDialog } from "@/components/fc/UploadFileDialog";
import LeftMenusPanel, { type LeftMenuItem } from "@/components/LeftMenusPanel";
import Loading from "@/components/Loading";
import type { WidgetProps } from "@/config/widgets";
import { getCurrentLang, SUPPORTED_LANGS, t } from "@/lang/i18n";
import {
  DataPlaneMode,
  getPanelUpgradeInfo,
  setSettingInfo,
  settingInfo,
  upgradePanel,
  type IUpgradeInfo,
  type JohnnykinsPanelSwitches,
  type Settings as SettingsData
} from "@/services/apis/settings";
import { useAppConfig } from "@/stores/appConfig";
import { useIsWebAdmin } from "@/stores/appState";
import { SETTINGS_PAGE, useLayoutConfig } from "@/stores/layoutConfig";
import { useLayoutContainer } from "@/stores/layoutContainer";
import { arrayFilter } from "@/tools/array";
import { pickLocalizedNotes } from "@/tools/localizedNotes";
import { reportErrorMsg } from "@/tools/validator";
import type { PageLayoutConfig } from "@/types";
import "./Settings.scss";

interface MySettings extends SettingsData {
  pageTitle?: string;
  logoUrl?: string;
  bgUrl?: string;
}

type PassportMode = JohnnykinsPanelSwitches["passport"]["mode"];

const isCN = () => ["zh_cn", "zh_tw"].includes(getCurrentLang());

const ApacheLicense = `Copyright ${new Date().getFullYear()} MCSManager

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`;

const DEFAULT_PASSPORT: JohnnykinsPanelSwitches = {
  passport: { mode: "standard", authTimeoutMs: 8000, legacy: { passportType: 4, tokenEntropy: true, maxEntropy: 3, passportTtlSeconds: 60 } },
  remoteService: { heartbeatIntervalMs: 60000, localDaemonRetryMs: 5000 }
};

/** Title + secondary description + control, the repeated block of every pane. */
function Field({ title, desc, children, hidden }: { title: ReactNode; desc?: ReactNode; children: ReactNode; hidden?: boolean }) {
  return (
    <Form.Item hidden={hidden}>
      <Typography.Title level={5}>{title}</Typography.Title>
      {desc !== undefined && (
        <Typography.Paragraph>
          <Typography.Text type="secondary">{desc}</Typography.Text>
        </Typography.Paragraph>
      )}
      {children}
    </Form.Item>
  );
}

function Pane({ title, maxHeight, children }: { title: string; maxHeight: string; children: ReactNode }) {
  return (
    <div className="content-box" style={{ maxHeight }}>
      <Typography.Title level={4} className="mb-24">
        {title}
      </Typography.Title>
      <div style={{ textAlign: "left" }}>
        <Form layout="vertical">{children}</Form>
      </div>
    </div>
  );
}

export default function Settings({ card }: WidgetProps) {
  const { modal, message, notification } = App.useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useSearchParams();
  const pages = useLayoutConfig((s) => s.pages);
  const setPages = useLayoutConfig((s) => s.setPages);
  const saveLayout = useLayoutConfig((s) => s.save);
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const setDesignMode = useLayoutContainer((s) => s.setDesignMode);
  const sidebarPositionNow = useAppConfig((s) => s.sidebarPosition);
  const isWebAdmin = useIsWebAdmin();

  const [formData, setFormData] = useState<MySettings>();
  const [submitting, setSubmitting] = useState(false);
  const [sidebarPosition, setSidebarPosition] = useState<"left" | "right">("left");
  const [ssoSnapshot, setSsoSnapshot] = useState({ ssoType: "", ssoIssuer: "", ssoUserinfoUrl: "", ssoUserIdField: "" });
  const [activeKey, setActiveKey] = useState<string>();
  const [upgradeInfo, setUpgradeInfo] = useState<IUpgradeInfo>();
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  /** Passport mode as loaded from the panel; changing it needs confirmation. */
  const savedMode = useRef<PassportMode>(undefined);

  const set = <K extends keyof MySettings>(key: K, value: MySettings[K]) => setFormData((f) => (f ? { ...f, [key]: value } : f));
  const passport = formData?.johnnykins?.passport ?? DEFAULT_PASSPORT.passport;
  const setPassport = (patch: Partial<JohnnykinsPanelSwitches["passport"]>, legacy?: Partial<JohnnykinsPanelSwitches["passport"]["legacy"]>) =>
    setFormData((f) =>
      f ? { ...f, johnnykins: { ...f.johnnykins, passport: { ...passport, ...patch, legacy: { ...passport.legacy, ...(legacy ?? {}) } } } } : f
    );
  const remoteTiming = formData?.johnnykins?.remoteService ?? DEFAULT_PASSPORT.remoteService!;
  const setRemoteTiming = (patch: Partial<NonNullable<JohnnykinsPanelSwitches["remoteService"]>>) =>
    setFormData((f) => (f ? { ...f, johnnykins: { ...(f.johnnykins ?? DEFAULT_PASSPORT), remoteService: { ...remoteTiming, ...patch } } } : f));

  const settingsPage = () => pages.find((p) => p.page === SETTINGS_PAGE);

  /** Upstream setSettingsConfig: replace the __settings__ page, save, reload. */
  const saveSettingsPage = async (cfg: PageLayoutConfig) => {
    const others = pages.filter((p) => p.page !== SETTINGS_PAGE);
    setPages([...others, cfg]);
    await saveLayout();
    setTimeout(() => window.location.reload(), 200);
  };

  const refreshUpgradeInfo = async () => {
    if (upgradeLoading) return;
    setUpgradeLoading(true);
    try {
      setUpgradeInfo(await getPanelUpgradeInfo());
    } catch {
      // keep the last known state (upstream behaviour)
    } finally {
      setUpgradeLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    const initialTab = query.get("tab");
    void (async () => {
      try {
        const res = await settingInfo();
        if (!alive || !res) return;
        const cfg = settingsPage();
        savedMode.current = (res.johnnykins ?? DEFAULT_PASSPORT).passport.mode;
        setFormData({
          ...res,
          johnnykins: res.johnnykins ?? DEFAULT_PASSPORT,
          logoUrl: cfg?.theme?.logoImage || undefined,
          bgUrl: cfg?.theme?.backgroundImage || undefined,
          pageTitle: cfg?.theme?.pageTitle || t("TXT_CODE_47ae8ee6")
        });
        setSsoSnapshot({
          ssoType: res.ssoType || "oidc",
          ssoIssuer: res.ssoIssuer || "",
          ssoUserinfoUrl: res.ssoUserinfoUrl || "",
          ssoUserIdField: res.ssoUserIdField || "id"
        });
        const pos = cfg?.theme?.sidebarPosition;
        setSidebarPosition(pos === "left" || pos === "right" ? pos : sidebarPositionNow);
        if (initialTab === "pro") setActiveKey("pro");
      } catch (err) {
        reportErrorMsg(err);
      }
    })();
    void refreshUpgradeInfo();
    // Upstream drops ?tab= when leaving the page. Dropping it here, once it
    // has been read, has the same effect; doing it on unmount would navigate
    // back to /settings, because setQuery resolves against this route.
    if (initialTab !== null) {
      setQuery(
        (q) => {
          q.delete("tab");
          return q;
        },
        { replace: true }
      );
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * @param includePassport only the Daemon Passport pane sends the passport
   * switches, so a mode change always goes through its confirmation.
   */
  const submit = async (needReload = true, includePassport = false) => {
    const data = formData;
    if (!data) return;
    setSubmitting(true);
    try {
      // pageTitle/logoUrl/bgUrl live in the layout, not the settings API.
      const { pageTitle: _p, logoUrl: _l, bgUrl: _b, johnnykins, ...rest } = data;
      void _p;
      void _l;
      void _b;
      await setSettingInfo({ data: includePassport ? { ...rest, johnnykins } : rest });
      message.success(t("TXT_CODE_a7907771"));
      if (needReload) setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      reportErrorMsg(error);
    } finally {
      setSubmitting(false);
    }
  };

  const saveTheme = (title: string, apply: (theme: NonNullable<PageLayoutConfig["theme"]>) => void, missingMsg: string, successMsg = false) =>
    modal.confirm({
      title,
      content: t("TXT_CODE_cf95364f"),
      onOk: async () => {
        const cfg = settingsPage();
        if (!cfg?.theme) return reportErrorMsg(missingMsg);
        const theme = { ...cfg.theme };
        apply(theme);
        await saveSettingsPage({ ...cfg, theme });
        if (successMsg) message.success(t("TXT_CODE_a7907771"));
      }
    });

  const handleSavePageTitle = () =>
    saveTheme(t("TXT_CODE_3d811e3e"), (th) => (th.pageTitle = formData?.pageTitle?.trim() || t("TXT_CODE_47ae8ee6")), t("TXT_CODE_c7cb38fd"), true);
  const handleSaveLogoUrl = (url?: string) =>
    saveTheme(t("TXT_CODE_dc053043"), (th) => (th.logoImage = url ?? formData?.logoUrl ?? ""), t("TXT_CODE_b89780e2"));
  const handleSaveBgUrl = (url?: string) =>
    saveTheme(t("TXT_CODE_c0606ef4"), (th) => (th.backgroundImage = url ?? formData?.bgUrl ?? ""), t("TXT_CODE_b89780e2"));

  const handleSaveSidebarPosition = async () => {
    const cfg = settingsPage();
    if (!cfg) return reportErrorMsg(t("TXT_CODE_b89780e2"));
    const theme = cfg.theme ?? { pageTitle: "", logoImage: "", backgroundImage: "" };
    await saveSettingsPage({ ...cfg, theme: { ...theme, sidebarPosition } });
    message.success(t("TXT_CODE_a7907771"));
  };

  const upload = async (key: "logoUrl" | "bgUrl") => {
    const url = await openUploadFileDialog();
    if (url) set(key, url);
  };

  const startDesignUI = () => {
    setDesignMode(true);
    notification.warning({ placement: "bottom", title: t("TXT_CODE_7b1adf35"), description: t("TXT_CODE_6b6f1d3") });
  };

  // ---- SSO ----
  const ssoMode = !formData?.ssoEnabled ? "disabled" : formData.ssoType === "oauth2" ? "oauth2" : "oidc";
  const setSsoMode = (val: string) =>
    setFormData((f) => (f ? (val === "disabled" ? { ...f, ssoEnabled: false } : { ...f, ssoEnabled: true, ssoType: val }) : f));

  const isSsoIdentityChanged = () => {
    const fd = formData;
    if (!fd) return false;
    const curType = fd.ssoType || "oidc";
    if (curType !== ssoSnapshot.ssoType) return true;
    if (curType === "oidc" && (fd.ssoIssuer || "") !== ssoSnapshot.ssoIssuer) return true;
    if (curType === "oauth2") {
      if ((fd.ssoUserinfoUrl || "") !== ssoSnapshot.ssoUserinfoUrl) return true;
      if ((fd.ssoUserIdField || "id") !== ssoSnapshot.ssoUserIdField) return true;
    }
    return false;
  };

  const doSubmitSso = async () => {
    await submit(false);
    if (formData)
      setSsoSnapshot({
        ssoType: formData.ssoType || "oidc",
        ssoIssuer: formData.ssoIssuer || "",
        ssoUserinfoUrl: formData.ssoUserinfoUrl || "",
        ssoUserIdField: formData.ssoUserIdField || "id"
      });
  };

  const submitSso = async () => {
    const fd = formData;
    if (fd?.ssoEnabled) {
      if (!fd.ssoClientId?.trim()) return message.error(t("TXT_CODE_SSO_ENABLE_REQUIRES_CONFIG"));
      if (fd.ssoType === "oauth2") {
        if (!fd.ssoAuthorizeUrl?.trim() || !fd.ssoTokenUrl?.trim() || !fd.ssoUserinfoUrl?.trim())
          return message.error(t("TXT_CODE_SSO_OAUTH2_REQUIRES_URLS"));
      } else if (!fd.ssoIssuer?.trim()) {
        return message.error(t("TXT_CODE_SSO_ENABLE_REQUIRES_CONFIG"));
      }
    }
    if (isSsoIdentityChanged()) {
      modal.confirm({
        title: t("TXT_CODE_SSO_IDENTITY_CHANGE_TITLE"),
        content: t("TXT_CODE_SSO_IDENTITY_CHANGE_CONFIRM"),
        okType: "danger",
        onOk: doSubmitSso
      });
      return;
    }
    await doSubmitSso();
  };

  // ---- Panel self-update ----
  const upgradeNotes = useMemo(() => pickLocalizedNotes(upgradeInfo?.onlineNotes, getCurrentLang()), [upgradeInfo]);
  const onUpdateWeb = () =>
    modal.confirm({
      title: t("TXT_CODE_AUTOUPDATE_WEB_BTN"),
      content: t("TXT_CODE_AUTOUPDATE_WEB_CONFIRM"),
      okText: t("TXT_CODE_AUTOUPDATE_BTN_OK"),
      cancelText: t("TXT_CODE_AUTOUPDATE_BTN_CANCEL"),
      onOk: async () => {
        try {
          const res = await upgradePanel();
          if (!res?.started) {
            message.info(res?.message || t("TXT_CODE_AUTOUPDATE_ALREADY_LATEST"));
            return;
          }
          // Files are applied on disk; the operator restarts the panel.
          modal.success({ content: t("TXT_CODE_AUTOUPDATE_WEB_SUCCESS", { v: res.onlineVersion }) });
        } catch (error) {
          reportErrorMsg(error instanceof Error && error.message ? error.message : t("TXT_CODE_AUTOUPDATE_WEB_FAILED"));
        }
      }
    });

  // ---- Johnnykins passport ----
  const submitPassport = () => {
    if (passport.mode !== savedMode.current) {
      modal.confirm({
        title: t("TXT_CODE_JK_MODE_CHANGE_TITLE"),
        content: t("TXT_CODE_JK_MODE_CHANGE_CONFIRM"),
        okType: "danger",
        onOk: () => submit(true, true)
      });
      return;
    }
    void submit(false, true);
  };

  // antd 6 Select values must be strings or numbers, so booleans travel as "true"/"false".
  const yesNo = [
    { label: t("TXT_CODE_52c8a730"), value: "true" },
    { label: t("TXT_CODE_718c9310"), value: "false" }
  ];
  const yesNoSelect = (field: keyof MySettings) => (
    <Select value={String(Boolean(formData?.[field]))} style={{ maxWidth: 320 }} options={yesNo} onChange={(v) => set(field, (v === "true") as never)} />
  );
  const saveBtn = (onClick: () => void, cls = "button", label = t("TXT_CODE_abfe9512")) => (
    <div className={cls}>
      <Button type="primary" loading={submitting} onClick={onClick}>
        {label}
      </Button>
    </div>
  );
  const linkBtn = (item: { title: string; icon: ComponentType; url: string }) => {
    const Icon = item.icon;
    return (
      <div key={item.url} className="mr-12 mb-12">
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          <Button>
            <Icon /> {item.title}
          </Button>
        </a>
      </div>
    );
  };

  const menus: LeftMenuItem[] = arrayFilter<LeftMenuItem & { condition?: () => boolean }>([
    { title: t("TXT_CODE_cdd555be"), key: "baseInfo", icon: ProjectOutlined },
    { title: t("TXT_CODE_AUTOUPDATE_TAB_TITLE"), key: "autoUpdate", icon: CloudUploadOutlined },
    { title: t("TXT_CODE_1c18acc0"), key: "ui", icon: PicLeftOutlined },
    { title: t("TXT_CODE_9c3ca8f"), key: "security", icon: LockOutlined },
    { title: t("TXT_CODE_JK_SEC_TAB_TITLE"), key: "additionalSecurity", icon: SecurityScanOutlined },
    { title: t("TXT_CODE_JK_TAB_TITLE"), key: "passport", icon: SafetyCertificateOutlined },
    { title: t("TXT_CODE_ea1600d2"), key: "audit", icon: FileProtectOutlined },
    { title: t("TXT_CODE_SSO_TAB_TITLE"), key: "sso", icon: ApiOutlined },
    {
      title: t("TXT_CODE_46cb40d5"),
      key: "sponsor",
      icon: MoneyCollectOutlined,
      condition: () => !isCN(),
      click: () => window.open(isCN() ? "https://afdian.com/a/mcsmanager" : "https://www.patreon.com/mcsmanager", "_blank", "noopener,noreferrer")
    },
    { title: t("TXT_CODE_3b4b656d"), key: "about", icon: QuestionCircleOutlined }
  ]);

  if (!formData) {
    return (
      <div className="Settings">
        <div className="loading flex-center w-100 h-100">
          <Loading />
        </div>
      </div>
    );
  }

  const h = card.height;
  const fd = formData;
  const panes: Record<string, ReactNode> = {
    baseInfo: (
      <Pane title={t("TXT_CODE_5206cf41")} maxHeight={h}>
        <Field
          title={t("TXT_CODE_a1a59b08")}
          desc={
            <>
              {t("TXT_CODE_2abeb185")}
              <br />
              {t("TXT_CODE_d648ff91")}
            </>
          }
        >
          <Select value={fd.language} style={{ maxWidth: 320 }} options={SUPPORTED_LANGS} onChange={(v) => set("language", v)} />
        </Field>
        <Field title={t("TXT_CODE_7f0017d2")} desc={t("TXT_CODE_233624ad")}>
          <Input value={fd.httpPort} style={{ maxWidth: 320 }} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => set("httpPort", e.target.value as never)} />
        </Field>
        <Field title={t("TXT_CODE_6265ae47")} desc={t("TXT_CODE_24c4768a")}>
          <Input value={fd.presetPackAddr} placeholder={t("TXT_CODE_4ea93630")} style={{ maxWidth: 320 }} onChange={(e) => set("presetPackAddr", e.target.value)} />
          <Button className="mx-8" type="primary" onClick={() => navigate("/market/editor")}>
            {t("TXT_CODE_ad207008")} <EditOutlined />
          </Button>
          <Button onClick={() => navigate("/market/editor?newTemplate=true")}>
            {t("TXT_CODE_53499d7")} <PlusOutlined />
          </Button>
        </Field>
        <Field title={t("TXT_CODE_514e064a")} desc={t("TXT_CODE_328191e")}>
          <Input value={fd.httpIp} style={{ maxWidth: 320 }} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => set("httpIp", e.target.value)} />
        </Field>
        <Field
          title="Panel ID"
          desc={
            <>
              {t("TXT_CODE_e2976753")}
              <br />
              <span>{fd.panelId ? t("TXT_CODE_e56cced3") : t("TXT_CODE_699b4b66")}</span>
            </>
          }
        >
          <Input value={fd.panelId} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => set("panelId", e.target.value)} />
        </Field>
        {saveBtn(() => void submit())}
      </Pane>
    ),
    ui: (
      <Pane title={t("TXT_CODE_1c18acc0")} maxHeight={h}>
        <Field title={t("TXT_CODE_SETTINGS_LAYOUT_SIDEBAR_POSITION_TITLE")} desc={t("TXT_CODE_SETTINGS_LAYOUT_SIDEBAR_POSITION_DESCRIPTION")}>
          <Select
            value={sidebarPosition}
            style={{ maxWidth: 320 }}
            onChange={setSidebarPosition}
            options={[
              { label: t("TXT_CODE_SETTINGS_LAYOUT_SIDEBAR_POSITION_LEFT"), value: "left" },
              { label: t("TXT_CODE_SETTINGS_LAYOUT_SIDEBAR_POSITION_RIGHT"), value: "right" }
            ]}
          />
          <Button type="primary" className="ml-6 mt-2" loading={submitting} onClick={() => void handleSaveSidebarPosition()}>
            {t("TXT_CODE_abfe9512")}
          </Button>
        </Field>
        <Field title={t("TXT_CODE_395f147d")} desc={t("TXT_CODE_b305236a")}>
          <Input value={fd.pageTitle} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => set("pageTitle", e.target.value)} />
        </Field>
        {saveBtn(handleSavePageTitle, "button mb-24")}
        <Field title={t("TXT_CODE_ebd2a6a1")} desc={<div>{t("TXT_CODE_ba717ff3")}</div>}>
          {!isDesignMode ? (
            <Button loading={submitting} onClick={startDesignUI}>
              {t("TXT_CODE_bc46c15b")}
            </Button>
          ) : (
            <p>{t("TXT_CODE_3b24a247")}</p>
          )}
        </Field>
        <Field title={t("TXT_CODE_b5b33dd4")} desc={t("TXT_CODE_c26e5fb7")}>
          <Input.TextArea value={fd.loginInfo} rows={4} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => set("loginInfo", e.target.value)} />
        </Field>
        {saveBtn(() => void submit(), "button mb-24")}
        <Field title={t("TXT_CODE_47b5a2f7")} desc={<div>{t("TXT_CODE_cf95364f")}</div>}>
          <Typography.Paragraph>
            <div className="flex">
              <Input value={fd.logoUrl} style={{ maxWidth: 320 }} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => set("logoUrl", e.target.value)} />
              <Button className="ml-6" onClick={() => void upload("logoUrl")}>
                {t("TXT_CODE_ae09d79d")}
              </Button>
            </div>
          </Typography.Paragraph>
          <Button type="primary" className="mr-6" onClick={() => handleSaveLogoUrl()}>
            {t("TXT_CODE_abfe9512")}
          </Button>
          <Button danger onClick={() => handleSaveLogoUrl("")}>
            {t("TXT_CODE_50d471b2")}
          </Button>
        </Field>
        <Field
          title={t("TXT_CODE_8ae0dc90")}
          desc={
            <>
              <div>{t("TXT_CODE_434786c9")}</div>
              <div>{t("TXT_CODE_cf95364f")}</div>
            </>
          }
        >
          <Typography.Paragraph>
            <div className="flex">
              <Input value={fd.bgUrl} style={{ maxWidth: 320 }} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => set("bgUrl", e.target.value)} />
              <Button className="ml-6" onClick={() => void upload("bgUrl")}>
                {t("TXT_CODE_ae09d79d")}
              </Button>
            </div>
          </Typography.Paragraph>
          <Button type="primary" className="mr-6" onClick={() => handleSaveBgUrl()}>
            {t("TXT_CODE_abfe9512")}
          </Button>
          <Button danger onClick={() => handleSaveBgUrl("")}>
            {t("TXT_CODE_50d471b2")}
          </Button>
        </Field>
      </Pane>
    ),
    security: (
      <Pane title={t("TXT_CODE_9c3ca8f")} maxHeight={h}>
        <Typography.Title level={5}>{t("TXT_CODE_ef0ce2e")}</Typography.Title>
        <Typography.Paragraph>
          <Typography.Text type="secondary">
            {t("TXT_CODE_fcde7b2e")}
            <br />
            {t("TXT_CODE_af19b7b5")}
          </Typography.Text>
        </Typography.Paragraph>
        <Field title={t("TXT_CODE_95192169")} desc={t("TXT_CODE_820260c5")}>
          <Select
            value={String(fd.enableApiKey)}
            style={{ maxWidth: 320 }}
            onChange={(v) => set("enableApiKey", v === "ONLY_ADMIN" ? "ONLY_ADMIN" : v === "true")}
            options={[
              { label: t("TXT_CODE_52c8a730"), value: "true" },
              { label: t("TXT_CODE_675e5397"), value: "ONLY_ADMIN" },
              { label: t("TXT_CODE_718c9310"), value: "false" }
            ]}
          />
        </Field>
        <Field title={t("TXT_CODE_a583cae4")} desc={t("TXT_CODE_bfbdf579")}>
          {yesNoSelect("allowChangeCmd")}
        </Field>
        <Field
          title={t("TXT_CODE_adab942e")}
          desc={
            <>
              {t("TXT_CODE_ceb783a9")}
              <br />
              {t("TXT_CODE_e5b7522d")}
            </>
          }
        >
          {yesNoSelect("canFileManager")}
        </Field>
        <Field title={t("TXT_CODE_3c93920b")} desc={t("TXT_CODE_bc2e52a0")}>
          {yesNoSelect("allowUsePreset")}
        </Field>
        <Field title={t("TXT_CODE_405cd346")} desc={t("TXT_CODE_6655c905")}>
          {yesNoSelect("crossDomain")}
        </Field>
        <Field title={t("TXT_CODE_gzip_compress")} desc={t("TXT_CODE_gzip_compress_desc")}>
          {yesNoSelect("gzip")}
        </Field>
        <Field title={t("TXT_CODE_f0789d81")} desc={t("TXT_CODE_2b85af6d")}>
          {yesNoSelect("reverseProxyMode")}
        </Field>
        <Field title={t("TXT_CODE_66aeac82")} desc={t("TXT_CODE_fd8bc51f")} hidden={!fd.reverseProxyMode}>
          <Input value={fd.reverseProxyHeader} style={{ maxWidth: 320 }} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => set("reverseProxyHeader", e.target.value)} />
        </Field>
        <Field title={t("TXT_CODE_1d67c9c6")} desc={t("TXT_CODE_745fc959")}>
          {yesNoSelect("loginCheckIp")}
        </Field>
        <Field title={t("TXT_CODE_b026be33")} desc={t("TXT_CODE_a77b1a21")}>
          <Select
            value={fd.totpDriftToleranceSteps}
            style={{ maxWidth: 320 }}
            onChange={(v) => set("totpDriftToleranceSteps", v)}
            options={[
              { label: t("TXT_CODE_718c9310"), value: 0 },
              { label: "30 s", value: 1 },
              { label: "60 s", value: 2 }
            ]}
          />
        </Field>
        <Field title={t("TXT_CODE_settings_dataPlane")} desc={t("TXT_CODE_settings_dataPlane_hint")}>
          <Select
            value={fd.dataPlane}
            style={{ maxWidth: 320 }}
            onChange={(v) => set("dataPlane", v)}
            options={[
              { label: t("TXT_CODE_settings_dataPlane_direct"), value: DataPlaneMode.Direct },
              { label: t("TXT_CODE_settings_dataPlane_proxy"), value: DataPlaneMode.Proxy }
            ]}
          />
        </Field>
        {saveBtn(() => void submit(false))}
      </Pane>
    ),
    passport: (
      <Pane title={t("TXT_CODE_JK_TITLE")} maxHeight={h}>
        <Typography.Paragraph>
          <Typography.Text type="secondary">{t("TXT_CODE_JK_DESC")}</Typography.Text>
        </Typography.Paragraph>
        <Field title={t("TXT_CODE_JK_MODE")} desc={t("TXT_CODE_JK_MODE_DESC")}>
          <Select<PassportMode>
            value={passport.mode}
            style={{ maxWidth: 420, width: "100%" }}
            onChange={(mode) => setPassport({ mode })}
            options={[
              { label: t("TXT_CODE_JK_MODE_STANDARD"), value: "standard" },
              { label: t("TXT_CODE_JK_MODE_LEGACY"), value: "johnnykins-legacy" },
              { label: t("TXT_CODE_JK_MODE_OFF"), value: "off" }
            ]}
          />
        </Field>
        {passport.mode === "off" && (
          // SECURITY-WARNING: "off" falls back to the shared daemon key alone, with no mutual authentication.
          <Alert className="mb-24" type="warning" showIcon style={{ maxWidth: 640 }} title={t("TXT_CODE_JK_MODE_OFF")} />
        )}
        <Field title={t("TXT_CODE_JK_TIMEOUT")} desc={t("TXT_CODE_JK_TIMEOUT_DESC")}>
          <InputNumber
            value={passport.authTimeoutMs}
            min={2000}
            max={60000}
            step={500}
            style={{ maxWidth: 320, width: "100%" }}
            onChange={(v) => setPassport({ authTimeoutMs: Number(v) || 8000 })}
          />
        </Field>
        <Field title={t("TXT_CODE_JK_HEARTBEAT")} desc={t("TXT_CODE_JK_HEARTBEAT_DESC")}>
          <InputNumber
            value={remoteTiming.heartbeatIntervalMs}
            min={5000}
            max={600000}
            step={1000}
            style={{ maxWidth: 320, width: "100%" }}
            onChange={(v) => setRemoteTiming({ heartbeatIntervalMs: Number(v) || 60000 })}
          />
        </Field>
        <Field title={t("TXT_CODE_JK_LOCAL_RETRY")} desc={t("TXT_CODE_JK_LOCAL_RETRY_DESC")}>
          <InputNumber
            value={remoteTiming.localDaemonRetryMs}
            min={1000}
            max={600000}
            step={1000}
            style={{ maxWidth: 320, width: "100%" }}
            onChange={(v) => setRemoteTiming({ localDaemonRetryMs: Number(v) || 5000 })}
          />
        </Field>
        <Typography.Title level={5}>{t("TXT_CODE_JK_LEGACY_TITLE")}</Typography.Title>
        <Typography.Paragraph>
          <Typography.Text type="secondary">{t("TXT_CODE_JK_LEGACY_DESC")}</Typography.Text>
        </Typography.Paragraph>
        <Field title={t("TXT_CODE_JK_PASSPORT_TYPE")} desc={t("TXT_CODE_JK_PASSPORT_TYPE_DESC")}>
          <Select
            value={passport.legacy.passportType}
            disabled={passport.mode !== "johnnykins-legacy"}
            style={{ maxWidth: 320 }}
            onChange={(passportType) => setPassport({}, { passportType })}
            options={[1, 2, 3, 4].map((n) => ({ label: String(n), value: n }))}
          />
        </Field>
        <Field title={t("TXT_CODE_JK_ENTROPY")} desc={t("TXT_CODE_JK_ENTROPY_DESC")}>
          <Select
            value={String(passport.legacy.tokenEntropy)}
            disabled={passport.mode !== "johnnykins-legacy"}
            style={{ maxWidth: 320 }}
            options={yesNo}
            onChange={(v) => setPassport({}, { tokenEntropy: v === "true" })}
          />
        </Field>
        <Field title={t("TXT_CODE_JK_MAX_ENTROPY")} desc={t("TXT_CODE_JK_MAX_ENTROPY_DESC")}>
          <InputNumber
            value={passport.legacy.maxEntropy}
            disabled={passport.mode !== "johnnykins-legacy"}
            min={1}
            max={10}
            style={{ maxWidth: 320, width: "100%" }}
            onChange={(v) => setPassport({}, { maxEntropy: Number(v) || 3 })}
          />
        </Field>
        <Field title={t("TXT_CODE_JK_TTL")} desc={t("TXT_CODE_JK_TTL_DESC")}>
          <InputNumber
            value={passport.legacy.passportTtlSeconds}
            disabled={passport.mode !== "johnnykins-legacy"}
            min={5}
            max={600}
            style={{ maxWidth: 320, width: "100%" }}
            onChange={(v) => setPassport({}, { passportTtlSeconds: Number(v) || 60 })}
          />
        </Field>
        <Typography.Paragraph>
          <Typography.Text type="secondary">{t("TXT_CODE_JK_DAEMON_NOTE")}</Typography.Text>
        </Typography.Paragraph>
        {saveBtn(submitPassport)}
      </Pane>
    ),
    additionalSecurity: (
      <Pane title={t("TXT_CODE_JK_SEC_TAB_TITLE")} maxHeight={h}>
        <Typography.Paragraph>
          <Typography.Text type="secondary">{t("TXT_CODE_JK_SEC_DESC")}</Typography.Text>
        </Typography.Paragraph>
        <Field title={t("TXT_CODE_JK_SEC_WEBADMIN")} desc={t("TXT_CODE_JK_SEC_WEBADMIN_DESC")}>
          {/* SECURITY: the panel also refuses this unless the caller is a Web Admin. */}
          <Select
            value={String(Boolean(fd.webAdminEnforced))}
            disabled={!isWebAdmin}
            style={{ maxWidth: 320 }}
            options={yesNo}
            onChange={(v) => set("webAdminEnforced", v === "true")}
          />
        </Field>
        <Field title={t("TXT_CODE_JK_SEC_SESSION")} desc={t("TXT_CODE_JK_SEC_SESSION_DESC")}>
          <InputNumber
            value={fd.sessionMaxAgeMinutes ?? 60}
            min={0}
            max={10080}
            style={{ maxWidth: 320, width: "100%" }}
            onChange={(v) => set("sessionMaxAgeMinutes", Number(v ?? 0))}
          />
        </Field>
        <Field title={t("TXT_CODE_JK_SEC_HELMET")} desc={t("TXT_CODE_JK_SEC_HELMET_DESC")}>
          {yesNoSelect("helmet")}
        </Field>
        <Field title={t("TXT_CODE_JK_SEC_CORS")} desc={t("TXT_CODE_JK_SEC_CORS_DESC")}>
          {yesNoSelect("cors")}
        </Field>
        <Field title={t("TXT_CODE_JK_SEC_ORIGIN")} desc={t("TXT_CODE_JK_SEC_ORIGIN_DESC")} hidden={!fd.cors}>
          <Input value={fd.origin} style={{ maxWidth: 480 }} placeholder="https://panel.example.com" onChange={(e) => set("origin", e.target.value)} />
        </Field>
        <Field title={t("TXT_CODE_JK_SEC_RATE")} desc={t("TXT_CODE_JK_SEC_RATE_DESC")}>
          {yesNoSelect("rateLimiter")}
        </Field>
        <Field title={t("TXT_CODE_JK_SEC_RATE_MAX")} hidden={!fd.rateLimiter}>
          <InputNumber
            value={fd.rateLimitMax ?? 20}
            min={1}
            max={100000}
            style={{ maxWidth: 320, width: "100%" }}
            onChange={(v) => set("rateLimitMax", Number(v) || 20)}
          />
        </Field>
        <Field title={t("TXT_CODE_JK_SEC_RATE_DURATION")} hidden={!fd.rateLimiter}>
          <InputNumber
            value={fd.rateLimitDuration ?? 10000}
            min={1000}
            max={86400000}
            step={1000}
            style={{ maxWidth: 320, width: "100%" }}
            onChange={(v) => set("rateLimitDuration", Number(v) || 10000)}
          />
        </Field>
        <Field title={t("TXT_CODE_JK_SEC_DAEMONS")} desc={t("TXT_CODE_JK_SEC_DAEMONS_DESC")} hidden={!fd.rateLimiter}>
          {(fd.daemonServerIDs ?? []).map((id, index) => (
            <div key={index} style={{ display: "flex", gap: 8, maxWidth: 480, marginBottom: 8 }}>
              <Input
                value={id}
                placeholder={t("TXT_CODE_JK_SEC_DAEMON_PLACEHOLDER")}
                onChange={(e) => set("daemonServerIDs", (fd.daemonServerIDs ?? []).map((v, i) => (i === index ? e.target.value : v)))}
              />
              <Button danger onClick={() => set("daemonServerIDs", (fd.daemonServerIDs ?? []).filter((_, i) => i !== index))}>
                {t("TXT_CODE_JK_SEC_REMOVE")}
              </Button>
            </div>
          ))}
          <Button onClick={() => set("daemonServerIDs", [...(fd.daemonServerIDs ?? []), ""])}>{t("TXT_CODE_JK_SEC_ADD")}</Button>
        </Field>
        <Field title={t("TXT_CODE_JK_SEC_PANDORA")} desc={t("TXT_CODE_JK_SEC_PANDORA_DESC")}>
          {yesNoSelect("pandorasWall")}
        </Field>
        <Field title={t("TXT_CODE_JK_SEC_DEVBLOCKER")} desc={t("TXT_CODE_JK_SEC_DEVBLOCKER_DESC")}>
          {yesNoSelect("devBlocker")}
        </Field>
        {saveBtn(() => void submit(false))}
      </Pane>
    ),
    audit: (
      <Pane title={t("TXT_CODE_ea1600d2")} maxHeight={h}>
        <Field title={t("TXT_CODE_3c7c9297")} desc={t("TXT_CODE_16a4e557")}>
          {yesNoSelect("operationLogEnabled")}
        </Field>
        <Field title={t("TXT_CODE_186e1ce1")} desc={t("TXT_CODE_3effdfb0")}>
          <div className="audit-scope-list">
            {(
              [
                ["TXT_CODE_dbbaf16e", "operationLogRecordLogin"],
                ["TXT_CODE_b68c8da6", "operationLogRecordInstance"],
                ["TXT_CODE_95495db", "operationLogRecordFile"],
                ["TXT_CODE_500fed5c", "operationLogRecordUser"],
                ["TXT_CODE_36b3a6b", "operationLogRecordSystem"]
              ] as const
            ).map(([label, key]) => (
              <div key={key} className="audit-scope-item">
                <span className="mr-8">{t(label)}</span>
                <Checkbox checked={Boolean(fd[key])} onChange={(e) => set(key, e.target.checked)} />
              </div>
            ))}
          </div>
        </Field>
        <Field title={t("TXT_CODE_68f99fdf")} desc={t("TXT_CODE_507be396")}>
          <InputNumber
            value={fd.operationLogMaxLinesPerFile}
            style={{ maxWidth: 320, width: "100%" }}
            min={10}
            max={1000}
            step={10}
            onChange={(v) => set("operationLogMaxLinesPerFile", Number(v))}
          />
        </Field>
        <Field title={t("TXT_CODE_dda5f944")} desc={t("TXT_CODE_8d88f625")}>
          <InputNumber value={fd.operationLogKeepDays} style={{ maxWidth: 320, width: "100%" }} min={0} max={3650} onChange={(v) => set("operationLogKeepDays", Number(v))} />
        </Field>
        <Field title={t("TXT_CODE_706b201e")} desc={t("TXT_CODE_7ef4ecf4")}>
          <InputNumber
            value={fd.operationLogMaxTotalLines}
            style={{ maxWidth: 320, width: "100%" }}
            min={0}
            max={1000000}
            step={1000}
            onChange={(v) => set("operationLogMaxTotalLines", Number(v))}
          />
        </Field>
        {saveBtn(() => void submit(false))}
      </Pane>
    ),
    sso: (
      <Pane title={t("TXT_CODE_SSO_TAB_TITLE")} maxHeight={h}>
        <Field title={t("TXT_CODE_SSO_ENABLE")} desc={t("TXT_CODE_SSO_ENABLE_DESC")}>
          <Select
            value={ssoMode}
            style={{ maxWidth: 320 }}
            onChange={setSsoMode}
            options={[
              { label: t("TXT_CODE_718c9310"), value: "disabled" },
              { label: "OpenID Connect (OIDC)", value: "oidc" },
              { label: "OAuth 2.0", value: "oauth2" }
            ]}
          />
        </Field>
        {fd.ssoEnabled && (
          <>
            <Field title={t("TXT_CODE_SSO_PROVIDER_NAME")} desc={t("TXT_CODE_SSO_PROVIDER_NAME_DESC")}>
              <Input value={fd.ssoProviderName} style={{ maxWidth: 320 }} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => set("ssoProviderName", e.target.value)} />
            </Field>
            <Field title={t("TXT_CODE_SSO_ICON_URL")} desc={t("TXT_CODE_SSO_ICON_URL_DESC")}>
              <Input value={fd.ssoIconUrl} style={{ maxWidth: 320 }} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => set("ssoIconUrl", e.target.value)} />
            </Field>
            {ssoMode === "oidc" && (
              <Field title={t("TXT_CODE_SSO_ISSUER")} desc={t("TXT_CODE_SSO_ISSUER_DESC")}>
                <Input value={fd.ssoIssuer} style={{ maxWidth: 480 }} placeholder="https://accounts.example.com" onChange={(e) => set("ssoIssuer", e.target.value)} />
              </Field>
            )}
            {ssoMode === "oauth2" && (
              <>
                <Field title={t("TXT_CODE_SSO_AUTHORIZE_URL")} desc={t("TXT_CODE_SSO_AUTHORIZE_URL_DESC")}>
                  <Input value={fd.ssoAuthorizeUrl} style={{ maxWidth: 480 }} placeholder="https://github.com/login/oauth/authorize" onChange={(e) => set("ssoAuthorizeUrl", e.target.value)} />
                </Field>
                <Field title={t("TXT_CODE_SSO_TOKEN_URL")} desc={t("TXT_CODE_SSO_TOKEN_URL_DESC")}>
                  <Input value={fd.ssoTokenUrl} style={{ maxWidth: 480 }} placeholder="https://github.com/login/oauth/access_token" onChange={(e) => set("ssoTokenUrl", e.target.value)} />
                </Field>
                <Field title={t("TXT_CODE_SSO_USERINFO_URL")} desc={t("TXT_CODE_SSO_USERINFO_URL_DESC")}>
                  <Input value={fd.ssoUserinfoUrl} style={{ maxWidth: 480 }} placeholder="https://api.github.com/user" onChange={(e) => set("ssoUserinfoUrl", e.target.value)} />
                </Field>
                <Field title={t("TXT_CODE_SSO_USER_ID_FIELD")} desc={t("TXT_CODE_SSO_USER_ID_FIELD_DESC")}>
                  <Input value={fd.ssoUserIdField} style={{ maxWidth: 320 }} placeholder="id" onChange={(e) => set("ssoUserIdField", e.target.value)} />
                </Field>
                <Field title={t("TXT_CODE_SSO_SCOPES")} desc={t("TXT_CODE_SSO_SCOPES_DESC")}>
                  <Input value={fd.ssoScopes} style={{ maxWidth: 320 }} placeholder="read:user" onChange={(e) => set("ssoScopes", e.target.value)} />
                </Field>
              </>
            )}
            <Field title="Client ID" desc={t("TXT_CODE_SSO_CLIENT_ID_DESC")}>
              <Input value={fd.ssoClientId} style={{ maxWidth: 480 }} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => set("ssoClientId", e.target.value)} />
            </Field>
            <Field title="Client Secret" desc={t("TXT_CODE_SSO_CLIENT_SECRET_DESC")}>
              <Input.Password
                value={fd.ssoClientSecret}
                style={{ maxWidth: 480 }}
                placeholder={t("TXT_CODE_4d6e44c")}
                autoComplete="new-password"
                onChange={(e) => set("ssoClientSecret", e.target.value)}
              />
            </Field>
            <Field title={t("TXT_CODE_b25b5335")} desc={t("TXT_CODE_9a26aa70")}>
              <Select
                value={fd.ssoTokenAuthMethod}
                style={{ maxWidth: 320 }}
                onChange={(v) => set("ssoTokenAuthMethod", v)}
                options={[
                  { label: t("TXT_CODE_dc8de4ff"), value: "auto" },
                  { label: "client_secret_basic", value: "client_secret_basic" },
                  { label: "client_secret_post", value: "client_secret_post" }
                ]}
              />
            </Field>
            <Field title={t("TXT_CODE_SSO_CALLBACK_URL")} desc={t("TXT_CODE_SSO_CALLBACK_URL_DESC")}>
              <Input value={fd.ssoCallbackUrl} style={{ maxWidth: 480 }} placeholder="https://your-panel.com/api/auth/sso/callback" onChange={(e) => set("ssoCallbackUrl", e.target.value)} />
            </Field>
            <Field title={t("TXT_CODE_SSO_ALLOWED_REDIRECT_HOSTS")} desc={t("TXT_CODE_SSO_ALLOWED_REDIRECT_HOSTS_DESC")}>
              <Input
                value={fd.ssoAllowedRedirectHosts}
                style={{ maxWidth: 480 }}
                placeholder="panel.example.com,panel2.example.com:8443"
                onChange={(e) => set("ssoAllowedRedirectHosts", e.target.value)}
              />
            </Field>
            <Field title={t("TXT_CODE_SSO_ONLY_MODE")} desc={t("TXT_CODE_SSO_ONLY_MODE_DESC")}>
              {yesNoSelect("ssoOnlyMode")}
            </Field>
            <Field title={t("TXT_CODE_SSO_AUTO_REDIRECT")} desc={t("TXT_CODE_SSO_AUTO_REDIRECT_DESC")}>
              {yesNoSelect("ssoAutoRedirect")}
            </Field>
          </>
        )}
        {saveBtn(() => void submitSso())}
      </Pane>
    ),
    autoUpdate: (
      <Pane title={t("TXT_CODE_AUTOUPDATE_TAB_TITLE")} maxHeight={h}>
        <Field title={t("TXT_CODE_AUTOUPDATE_WEB_TITLE")} desc={t("TXT_CODE_AUTOUPDATE_WEB_TITLE_DESC")}>
          <div className="flex" style={{ gap: 12, flexWrap: "wrap" }}>
            {upgradeInfo && (
              <>
                <Typography.Text strong>v{upgradeInfo.currentVersion}</Typography.Text>
                {!upgradeInfo.configured ? (
                  <Tag color="default">{t("TXT_CODE_AUTOUPDATE_WEB_NOT_CONFIGURED")}</Tag>
                ) : upgradeInfo.updateAvailable ? (
                  <Tag color="processing">{t("TXT_CODE_AUTOUPDATE_WEB_LATEST", { v: upgradeInfo.onlineVersion })}</Tag>
                ) : (
                  <Tag color="success">{t("TXT_CODE_AUTOUPDATE_UP_TO_DATE")}</Tag>
                )}
              </>
            )}
            <Button size="small" loading={upgradeLoading} icon={<ReloadOutlined />} onClick={() => void refreshUpgradeInfo()}>
              {t("TXT_CODE_AUTOUPDATE_BTN_REFRESH")}
            </Button>
          </div>
          {upgradeInfo?.updateAvailable && upgradeNotes && (
            <div className="update-notes-box">
              <div className="update-notes-title">{t("TXT_CODE_AUTOUPDATE_WEB_NOTES")}</div>
              <div className="update-notes-body">{upgradeNotes}</div>
            </div>
          )}
        </Field>
        <Field title={t("TXT_CODE_AUTOUPDATE_WEB_BTN")} desc={t("TXT_CODE_AUTOUPDATE_WEB_ACTION_DESC")}>
          <Button type="primary" danger disabled={!upgradeInfo?.configured || !upgradeInfo?.updateAvailable} onClick={onUpdateWeb}>
            {t("TXT_CODE_AUTOUPDATE_WEB_BTN")}
          </Button>
        </Field>
        <Field title={t("TXT_CODE_AUTOUPDATE_WEB_SOURCE")} desc={t("TXT_CODE_AUTOUPDATE_WEB_SOURCE_DESC")}>
          <Input
            value={fd.updateSourceUrl}
            style={{ maxWidth: 480 }}
            placeholder={t("TXT_CODE_AUTOUPDATE_WEB_SOURCE_PH")}
            onChange={(e) => set("updateSourceUrl", e.target.value)}
          />
        </Field>
        <Field title={t("TXT_CODE_AUTOUPDATE_WEB_SOURCE_BACKUP")} desc={t("TXT_CODE_AUTOUPDATE_WEB_SOURCE_BACKUP_DESC")}>
          <Input
            value={fd.updateSourceUrlFallback}
            style={{ maxWidth: 480 }}
            placeholder={t("TXT_CODE_AUTOUPDATE_WEB_SOURCE_BACKUP_PH")}
            onChange={(e) => set("updateSourceUrlFallback", e.target.value)}
          />
        </Field>
        {saveBtn(() => void submit(false), "button mb-24", t("TXT_CODE_AUTOUPDATE_WEB_SAVE"))}
      </Pane>
    ),
    about: (
      <div className="content-box" style={{ maxHeight: h }}>
        <Typography.Title level={4} className="mb-24">
          {t("TXT_CODE_3b4b656d")}
        </Typography.Title>
        <Typography.Paragraph>
          <p>{t("TXT_CODE_d0c670df")}</p>
        </Typography.Paragraph>
        <div className="pb-4 flex">
          {[
            { title: "GitHub", icon: GithubOutlined, url: "https://github.com/MCSManager/MCSManager" },
            { title: "Discord", icon: MessageOutlined, url: "https://discord.gg/BNpYMVX7Cd" },
            // Johnnykins fork credits (same titles and links as the fork's About pane).
            { title: "Modified By", icon: GithubOutlined, url: "https://github.com/john1234brown/" },
            { title: "Personal Mentor Vampeyer", icon: GithubOutlined, url: "https://github.com/Vampeyer/" }
          ].map(linkBtn)}
        </div>
        <Typography.Paragraph>
          <p>{t("TXT_CODE_97433ac4")}</p>
        </Typography.Paragraph>
        <div className="pb-4 flex">
          {[
            { title: t("TXT_CODE_41dd4d19"), icon: BankOutlined, url: "https://mcsmanager.com/" },
            { title: t("TXT_CODE_74c3d3e5"), icon: BookOutlined, url: "https://docs.mcsmanager.com/" },
            { title: t("TXT_CODE_26407d1f"), icon: BugOutlined, url: "https://github.com/MCSManager/MCSManager/issues" }
          ].map(linkBtn)}
        </div>
        <Typography.Paragraph>
          <p>{t("TXT_CODE_e57bd50f")}</p>
          <pre style={{ fontSize: 13 }}>{ApacheLicense}</pre>
        </Typography.Paragraph>
      </div>
    ),
    sponsor: (
      <div className="content-box" style={{ maxHeight: h }}>
        <Typography.Title level={4} className="mb-24">
          {t("TXT_CODE_46cb40d5")}
        </Typography.Title>
        <Typography.Paragraph>
          <p>{t("TXT_CODE_d0c670df")}</p>
        </Typography.Paragraph>
      </div>
    )
  };

  return (
    <div className="Settings">
      <CardPanel className="CardWrapper" style={{ height: "100%" }} padding={false}>
        <LeftMenusPanel menus={menus} panes={panes} activeKey={activeKey} onChange={setActiveKey} />
      </CardPanel>
    </div>
  );
}
