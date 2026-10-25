/**
 * Login form card (port of widgets/LoginCard.vue): username/password, 2FA
 * code step, optional SSO button, and the same three-step animation.
 *
 * Security:
 * - Credentials go only to the panel's /api/auth/login over the page origin;
 *   they are never stored in localStorage or logged (CWE-312, CWE-532).
 * - Admin-authored login info is rendered through markdownToHTML (DOMPurify
 *   allow-list) before dangerouslySetInnerHTML (CWE-79).
 * - The SSO icon URL is admin-provided; React escapes it as an attribute and
 *   it is limited to http(s)/same-origin paths (CWE-79 via javascript: URL).
 * - Brute-force throttling and lockout are enforced server-side by the panel's
 *   login_ban service (NIST AC-7); the UI does not rely on client checks.
 */
import { CheckCircleOutlined, LoadingOutlined, LockOutlined, LoginOutlined, UserOutlined } from "@ant-design/icons";
import { App, Button, Divider, Input, Typography } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import CardPanel from "@/components/CardPanel";
import { t } from "@/lang/i18n";
import { loginPageInfo, loginUser, ssoConfig } from "@/services/apis";
import { isAdminUser, useAppState } from "@/stores/appState";
import { sleep } from "@/tools/common";
import { markdownToHTML } from "@/tools/safe";
import type { LayoutCard, SsoPublicConfig } from "@/types";
import "./LoginCard.scss";

const SAFE_ICON = /^(https?:\/\/|\/|\.\/)/i;
const SSO_AUTHORIZE_URL = "/api/auth/sso/authorize";

export default function LoginCard({ card }: { card?: LayoutCard }) {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [query] = useSearchParams();
  const isInstall = useAppState((s) => s.isInstall);
  const updateUserInfo = useAppState((s) => s.updateUserInfo);

  const [form, setForm] = useState({ username: "", password: "", code: "" });
  const [loginStep, setLoginStep] = useState(0);
  const [is2Fa, setIs2Fa] = useState(false);
  const [loginInfo, setLoginInfo] = useState("");
  const [sso, setSso] = useState<SsoPublicConfig | null>(null);

  const title = card?.title || t("TXT_CODE_3ba5ad");
  const handleSsoLogin = () => window.location.assign(SSO_AUTHORIZE_URL);

  useEffect(() => {
    (async () => {
      const info = await loginPageInfo().catch(() => undefined);
      setLoginInfo(info?.loginInfo ?? "");
      if (!useAppState.getState().isInstall) navigate("/install");
      const cfg = await ssoConfig().catch(() => null);
      if (cfg) setSso(cfg);
      if (cfg?.enabled && cfg.autoRedirect && !query.get("sso_error") && query.get("ssoAutoRedirect") !== "false") {
        handleSsoLogin();
        return;
      }
      const ssoError = query.get("sso_error");
      if (ssoError) {
        const titles: Record<string, string> = {
          sso_init_failed: t("TXT_CODE_SSO_ERROR_INIT_FAILED"),
          sso_auth_failed: t("TXT_CODE_SSO_ERROR_AUTH_FAILED"),
          session_expired: t("TXT_CODE_SSO_ERROR_SESSION_EXPIRED"),
          invalid_sso_session: t("TXT_CODE_SSO_ERROR_SESSION_EXPIRED"),
          sso_session_expired: t("TXT_CODE_SSO_ERROR_SESSION_EXPIRED")
        };
        // Query text is shown as plain text (React escapes it), never as HTML.
        modal.error({
          title: titles[ssoError] || `${t("TXT_CODE_SSO_ERROR")}: ${ssoError}`,
          content: query.get("sso_error_desc") || t("TXT_CODE_SSO_CALLBACK_FAIL")
        });
      }
    })();
    // Runs once on mount, like upstream onMounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    if (!form.username.trim() || !form.password.trim()) {
      message.error(t("TXT_CODE_c846074d"));
      return;
    }
    try {
      setLoginStep(1);
      await sleep(600);
      const result = await loginUser({ data: form });
      if (result === "NEED_2FA") {
        setLoginStep(0);
        setIs2Fa(true);
        return;
      }
      setIs2Fa(false);
      await sleep(600);
      try {
        await updateUserInfo();
        setLoginStep(2);
        await sleep(1000);
        setLoginStep(3);
        navigate(isAdminUser(useAppState.getState().userInfo) ? "/" : "/customer");
      } catch (err) {
        console.error(err);
        setLoginStep(0);
        modal.error({ title: t("TXT_CODE_da2fb99a"), content: t("TXT_CODE_6e718abe") });
      }
    } catch (err) {
      setLoginStep(0);
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const ssoIcon = sso?.iconUrl && SAFE_ICON.test(sso.iconUrl) ? (
    <img src={sso.iconUrl} alt="" style={{ width: 16, height: 16, marginRight: 6, verticalAlign: "middle" }} />
  ) : (
    <LoginOutlined />
  );
  const ssoLabel = sso?.providerName ? t("TXT_CODE_SSO_LOGIN_BTN", { name: sso.providerName }) : t("TXT_CODE_SSO_LOGIN_BTN_DEFAULT");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className={["w-100", "h-100", loginStep === 1 && "logging", loginStep === 3 && "loginDone"].filter(Boolean).join(" ")}>
      <CardPanel className="login-panel">
        <div className="login-panel-body" style={{ display: loginStep === 0 ? undefined : "none" }}>
          <Typography.Title level={3} className="mb-20 glitch-wrapper">
            <div className="glitch" data-text={title}>
              {title}
            </div>
          </Typography.Title>
          <Typography.Paragraph className="mb-20">{t("TXT_CODE_5b60ad00")}</Typography.Paragraph>
          <div className="account-input-container">
            {sso?.enabled && sso.onlyMode ? (
              <div className="sso-only-container">
                <Typography.Paragraph type="secondary" className="mb-20">
                  {t("TXT_CODE_SSO_ONLY_MODE_WARN")}
                </Typography.Paragraph>
                <Button size="large" type="primary" block icon={ssoIcon} onClick={handleSsoLogin}>
                  {ssoLabel}
                </Button>
              </div>
            ) : (
              <>
                <form onSubmit={(e) => e.preventDefault()}>
                  {!is2Fa ? (
                    <div>
                      <Input className="account" size="large" name="mcsm-name-input" autoComplete="username" placeholder={t("TXT_CODE_80a560a1")} value={form.username} onChange={set("username")} suffix={<UserOutlined style={{ color: "rgba(0,0,0,0.45)" }} />} />
                      <Input className="mt-20 account" type="password" size="large" name="mcsm-pw-input" autoComplete="current-password" placeholder={t("TXT_CODE_551b0348")} value={form.password} onChange={set("password")} onPressEnter={handleLogin} suffix={<LockOutlined style={{ color: "rgba(0,0,0,0.45)" }} />} />
                    </div>
                  ) : (
                    <div>
                      <Input className="mt-20 mb-20 account" size="large" name="mcsm-pw-2fa" autoComplete="one-time-code" inputMode="numeric" placeholder={t("TXT_CODE_7ac8b1d3")} value={form.code} onChange={set("code")} onPressEnter={handleLogin} suffix={<LockOutlined style={{ color: "rgba(0,0,0,0.45)" }} />} />
                    </div>
                  )}
                </form>
                <div className="mt-24 flex-between align-center">
                  <div className="mcsmanager-link">
                    {loginInfo && (
                      // SECURITY: sanitized by DOMPurify allow-list in markdownToHTML (CWE-79).
                      <div className="global-markdown-html" dangerouslySetInnerHTML={{ __html: markdownToHTML(loginInfo) }} />
                    )}
                    Powered by{" "}
                    <a href="https://mcsmanager.com" target="_blank" rel="noopener noreferrer">
                      MCSManager
                    </a>
                  </div>
                  <div className="justify-end">
                    <Button size="large" type="primary" style={{ minWidth: 95 }} onClick={handleLogin} disabled={!isInstall}>
                      {t("TXT_CODE_d2c1a316")}
                    </Button>
                  </div>
                </div>
                {sso?.enabled && !sso.onlyMode && (
                  <div className="sso-divider-section">
                    <Divider>{t("TXT_CODE_SSO_LOGIN_DIVIDER")}</Divider>
                    <Button size="large" block icon={ssoIcon} onClick={handleSsoLogin}>
                      {ssoLabel}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="login-panel-body flex-center" style={{ display: loginStep === 1 ? undefined : "none" }}>
          <div style={{ textAlign: "center" }}>
            <LoadingOutlined className="logging-icon" style={{ fontSize: 62, fontWeight: 800 }} />
          </div>
        </div>
        <div className="login-panel-body flex-center" style={{ display: loginStep >= 2 ? undefined : "none" }}>
          <div style={{ textAlign: "center" }}>
            <CheckCircleOutlined className="login-success-icon" style={{ fontSize: 62, color: "var(--color-green-6)" }} />
          </div>
        </div>
      </CardPanel>
    </div>
  );
}
