/**
 * First SSO login: bind the identity-provider account to a panel account
 * (port of views/SsoBindLogin.vue). Either binds to the account already
 * logged in, or asks for another account's password (and 2FA code).
 *
 * SECURITY: the pending SSO identity is held server-side in the session with
 * a short TTL (sso_router.ts); this page only sends credentials the user
 * types. Without a pending binding it goes straight back to /login.
 */
import { CheckCircleOutlined, LoadingOutlined, LockOutlined, SwapOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, App, Button, Input, Typography } from "antd";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import CardPanel from "@/components/CardPanel";
import { t } from "@/lang/i18n";
import { ssoBindCurrent, ssoBindLogin, ssoBindStatus, userInfoApi } from "@/services/apis";
import { isAdminUser, useAppState } from "@/stores/appState";
import { sleep } from "@/tools/common";
import { reportErrorMsg } from "@/tools/validator";
import "./SsoBind.scss";

export default function SsoBind() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const updateUserInfo = useAppState((s) => s.updateUserInfo);
  const [form, setForm] = useState({ username: "", password: "", code: "" });
  const [step, setStep] = useState(1);
  const [is2Fa, setIs2Fa] = useState(false);
  const [loggedInUserName, setLoggedInUserName] = useState("");
  const [showLoginForm, setShowLoginForm] = useState(false);
  // The route guard can move the user on before the delayed redirect in
  // finish() fires; never navigate from a page that is no longer mounted.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const status = await ssoBindStatus();
        if (!status?.pending) throw new Error("no pending SSO binding");
      } catch {
        if (alive) navigate("/login?sso_error=invalid_sso_session", { replace: true });
        return;
      }
      try {
        const info = await userInfoApi();
        if (alive && info?.userName) setLoggedInUserName(info.userName);
      } catch {
        // Not logged in.
      }
      if (alive) setStep(0);
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  const finish = async () => {
    message.success(t("TXT_CODE_SSO_BIND_SUCCESS"));
    setStep(2);
    await updateUserInfo();
    await sleep(1000);
    if (mounted.current) navigate(isAdminUser(useAppState.getState().userInfo) ? "/" : "/customer");
  };

  const handleBindCurrent = async () => {
    try {
      setStep(1);
      await sleep(400);
      await ssoBindCurrent();
      await finish();
    } catch (err) {
      setStep(0);
      reportErrorMsg(err);
    }
  };

  const handleBind = async () => {
    if (!form.username.trim() || !form.password.trim()) return message.error(t("TXT_CODE_c846074d"));
    try {
      setStep(1);
      await sleep(400);
      const result = await ssoBindLogin({ data: { username: form.username, password: form.password, code: form.code || undefined } });
      if (result === "NEED_2FA") {
        setStep(0);
        setIs2Fa(true);
        return;
      }
      setIs2Fa(false);
      await finish();
    } catch (err) {
      setStep(0);
      reportErrorMsg(err);
    }
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const iconStyle = { color: "rgba(0, 0, 0, 0.45)" };

  return (
    <div className="sso-bind-container">
      <CardPanel className="sso-bind-card">
        <div className="sso-bind-body" style={{ display: step === 0 ? undefined : "none" }}>
          <Typography.Title level={3} className="mb-12">
            {t("TXT_CODE_SSO_BIND_TITLE")}
          </Typography.Title>
          <Typography.Paragraph className="mb-20">{t("TXT_CODE_SSO_BIND_DESC")}</Typography.Paragraph>

          {loggedInUserName && !showLoginForm ? (
            <div>
              <Alert
                type="info"
                showIcon
                className="mb-20"
                title={
                  <>
                    {t("TXT_CODE_SSO_BIND_CURRENT_HINT")} <strong>{loggedInUserName}</strong>
                  </>
                }
              />
              <div className="mt-24" style={{ textAlign: "right" }}>
                <Button className="mr-10" icon={<SwapOutlined />} onClick={() => setShowLoginForm(true)}>
                  {t("TXT_CODE_SSO_BIND_OTHER_ACCOUNT")}
                </Button>
                <Button size="large" type="primary" onClick={() => void handleBindCurrent()}>
                  {t("TXT_CODE_SSO_BIND_CURRENT_BTN")}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              {loggedInUserName && (
                <div className="mb-16">
                  <Button type="link" style={{ padding: 0 }} onClick={() => setShowLoginForm(false)}>
                    &larr; {t("TXT_CODE_SSO_BIND_BACK_CURRENT")}
                  </Button>
                </div>
              )}
              <form onSubmit={(e) => e.preventDefault()}>
                {!is2Fa ? (
                  <div>
                    <Input className="account" size="large" autoComplete="username" placeholder={t("TXT_CODE_80a560a1")} value={form.username} onChange={set("username")} suffix={<UserOutlined style={iconStyle} />} />
                    <Input className="mt-20 account" type="password" size="large" autoComplete="current-password" placeholder={t("TXT_CODE_551b0348")} value={form.password} onChange={set("password")} onPressEnter={() => void handleBind()} suffix={<LockOutlined style={iconStyle} />} />
                  </div>
                ) : (
                  <Input className="mt-20 mb-20 account" size="large" autoComplete="one-time-code" inputMode="numeric" placeholder={t("TXT_CODE_7ac8b1d3")} value={form.code} onChange={set("code")} onPressEnter={() => void handleBind()} suffix={<LockOutlined style={iconStyle} />} />
                )}
              </form>
              <div className="mt-24" style={{ textAlign: "right" }}>
                <Button size="large" type="primary" style={{ minWidth: 95 }} onClick={() => void handleBind()}>
                  {t("TXT_CODE_SSO_BIND_TITLE")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="sso-bind-body flex-center" style={{ display: step === 1 ? undefined : "none" }}>
          <LoadingOutlined style={{ fontSize: 62, fontWeight: 800 }} />
        </div>
        <div className="sso-bind-body flex-center" style={{ display: step >= 2 ? undefined : "none" }}>
          <CheckCircleOutlined style={{ fontSize: 62, color: "var(--color-green-6)" }} />
        </div>
      </CardPanel>
    </div>
  );
}
