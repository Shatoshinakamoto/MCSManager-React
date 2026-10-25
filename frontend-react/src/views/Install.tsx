/**
 * First-run setup wizard (port of views/Install.vue): language -> welcome ->
 * create admin -> finish. Same steps, copy, styles and API calls.
 *
 * Security:
 * - The panel's /api/auth/install handler is authoritative: it only works
 *   while no user exists and re-validates the password (9-36 chars, upper,
 *   lower, digit) server-side (ASVS V2.1, NIST SP 800-63B). The client rule
 *   below mirrors it for early feedback only (CWE-20).
 * - The password is held in form state only and never persisted or logged.
 */
import { ArrowRightOutlined } from "@ant-design/icons";
import { Button, Col, Form, Input, Row, Skeleton, Typography } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import CardPanel from "@/components/CardPanel";
import { changeLanguageInPlace, SUPPORTED_LANGS, t, toStandardLang } from "@/lang/i18n";
import { apiService } from "@/services/apiService";
import { panelInstall } from "@/services/apis";
import { useAppState } from "@/stores/appState";
import { reportErrorMsg } from "@/tools/validator";
import { SKELETONS } from "./Login";
import "./Install.scss";

// Mirrors panel user_service.validatePassword (server remains authoritative).
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{9,36}$/;

export default function Install() {
  useTranslation(); // re-render when the wizard switches language
  const navigate = useNavigate();
  const isInstall = useAppState((s) => s.isInstall);
  const initialLang = useAppState((s) => s.language);
  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState(() => {
    const l = toStandardLang(initialLang);
    return SUPPORTED_LANGS.some((x) => x.value === l) ? l : "en_us";
  });
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<{ username: string; password: string }>();

  const applyLanguage = async (lang: string) => {
    // Same call as upstream initInstallPageFlow(): persist the panel language.
    await apiService.subscribe({ url: "/api/overview/install", method: "PUT", data: { language: lang }, forceRequest: true }).catch(reportErrorMsg);
    await changeLanguageInPlace(lang);
  };

  const createUser = async () => {
    setLoading(true);
    try {
      const values = await form.validateFields();
      await panelInstall({ data: { ...values } });
      await useAppState.getState().updatePanelStatus();
      await useAppState.getState().updateUserInfo();
      setStep(3);
    } catch (err) {
      const fields = (err as { errorFields?: { errors: string[] }[] }).errorFields;
      if (fields) fields.forEach((f) => f.errors.forEach(reportErrorMsg));
      else reportErrorMsg(err);
    } finally {
      setLoading(false);
    }
  };

  const finish = (path: string) => {
    navigate(`${path}?from_install=1`);
    window.location.reload();
  };

  return (
    <>
      <Row gutter={[24, 24]}>
        {SKELETONS.map((s, i) => (
          <Col key={i} span={s.span}>
            <CardPanel fullHeight={false}>
              <Skeleton paragraph={{ rows: s.rows }} />
            </CardPanel>
          </Col>
        ))}
      </Row>

      {step === 0 && (
        <div className="install-page-container">
          <CardPanel fullHeight={false} className="install-panel language-select-panel">
            <Typography style={{ textAlign: "center", marginBottom: 40 }}>
              <Typography.Title level={2} style={{ marginBottom: 8 }}>
                Language
              </Typography.Title>
              <Typography.Text type="secondary">Choose your preferred language</Typography.Text>
            </Typography>
            <div className="language-grid">
              {SUPPORTED_LANGS.map((lang) => (
                <div
                  key={lang.value}
                  className={["language-card", language === lang.value && "language-card-active"].filter(Boolean).join(" ")}
                  onClick={() => {
                    setLanguage(lang.value);
                    void applyLanguage(lang.value);
                  }}
                >
                  <div className="language-card-inner language-label">{lang.label}</div>
                </div>
              ))}
            </div>
            <div className="text-center mt-35 mb-5">
              <Button
                type="primary"
                size="large"
                style={{ minWidth: 160, height: 48, fontSize: 16 }}
                onClick={async () => {
                  await applyLanguage(language);
                  setStep(1);
                }}
              >
                {t("TXT_CODE_5e9022f8")} <ArrowRightOutlined />
              </Button>
            </div>
          </CardPanel>
        </div>
      )}

      {step === 1 && (
        <div className="install-page-container" style={{ textAlign: "center" }}>
          <CardPanel fullHeight={false} className="install-panel">
            <Typography>
              <Typography.Title level={3}>{t("TXT_CODE_00000001")}</Typography.Title>
              <Typography.Paragraph>
                <Typography.Text>{t("TXT_CODE_81d7e7c5")}</Typography.Text>
              </Typography.Paragraph>
            </Typography>
            {isInstall ? (
              <Button disabled className="mt-45 mb-45" type="primary" size="large">
                {t("TXT_CODE_3371000d")}
              </Button>
            ) : (
              <Button className="mt-45 mb-45" type="primary" size="large" style={{ minWidth: 160, height: 48, fontSize: 16 }} onClick={() => setStep(2)}>
                {t("TXT_CODE_351aaf7")}
              </Button>
            )}
          </CardPanel>
        </div>
      )}

      {step === 2 && (
        <div className="install-page-container">
          <CardPanel fullHeight={false} className="install-panel">
            <Typography>
              <Typography.Title level={3}>{t("TXT_CODE_f880b5ad")}</Typography.Title>
              <Typography.Paragraph>
                <Typography.Text>{t("TXT_CODE_3a056dc8")}</Typography.Text>
              </Typography.Paragraph>
            </Typography>
            <Form form={form} labelCol={{ span: 4 }} autoComplete="off">
              <Form.Item name="username" rules={[{ required: true, max: 64, message: t("TXT_CODE_2695488c") }]}>
                <Input autoComplete="off" placeholder={t("TXT_CODE_eb9fcdad")} />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, pattern: PASSWORD_RULE, message: t("TXT_CODE_ad533c70") }]}>
                <Input.Password autoComplete="new-password" placeholder={t("TXT_CODE_551b0348")} />
              </Form.Item>
              <Form.Item wrapperCol={{ span: 16 }}>
                <Button loading={loading} type="primary" onClick={createUser}>
                  {t("TXT_CODE_11d5caea")}
                </Button>
              </Form.Item>
            </Form>
          </CardPanel>
        </div>
      )}

      {step === 3 && (
        <div className="install-page-container">
          <CardPanel fullHeight={false} className="install-panel">
            <Typography>
              <Typography.Title level={3}>{t("TXT_CODE_97be50a8")}</Typography.Title>
              <Typography.Paragraph>
                <Typography.Text>{t("TXT_CODE_cd923ade")}</Typography.Text>
              </Typography.Paragraph>
            </Typography>
            <div className="final-btn mb-15" onClick={() => finish("/market")}>
              <Typography.Title level={5}>{t("TXT_CODE_6f98ccd7")}</Typography.Title>
              <Typography.Text>{t("TXT_CODE_b5ca0563")}</Typography.Text>
            </div>
            <div className="final-btn" onClick={() => finish("/")}>
              <Typography.Title level={5}>{t("TXT_CODE_b69550bf")}</Typography.Title>
              <Typography.Text>{t("TXT_CODE_95df80df")}</Typography.Text>
            </div>
          </CardPanel>
        </div>
      )}
    </>
  );
}
