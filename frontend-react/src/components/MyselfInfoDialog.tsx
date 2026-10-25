/**
 * Current user's profile dialog (port of MyselfInfoDialog.vue): account info,
 * password change, TOTP 2FA bind/disable, and API key generate/disable.
 *
 * Security:
 * - Password inputs are masked (upstream used plain text inputs) and checked
 *   for match and 9-36 length client-side; the panel re-validates
 *   (NIST SP 800-63B, ASVS V2.1).
 * - The 2FA QR code is rendered only if the panel returned a data:image/ URL
 *   (CWE-79 via img src).
 * - A newly generated API key is shown once from memory and never persisted
 *   (CWE-312); disabling requires confirmation.
 */
import { App, Button, Col, Form, Input, Modal, Popconfirm, Row, Tag, Typography } from "antd";
import { useState } from "react";
import CopyButton from "@/components/CopyButton";
import { permissionLabel } from "@/config/const";
import { t } from "@/lang/i18n";
import { bind2FA, confirm2FA, setUserApiKey, updatePassword } from "@/services/apis/user";
import { useAppState } from "@/stores/appState";
import { useAppTools } from "@/stores/appTools";
import { reportErrorMsg } from "@/tools/validator";

const SAFE_QR = /^data:image\/(png|jpeg|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

export default function MyselfInfoDialog() {
  const { message } = App.useApp();
  const user = useAppState((s) => s.userInfo);
  const updateUserInfo = useAppState((s) => s.updateUserInfo);
  const { showUserInfoDialog, setShowUserInfoDialog, generatedApiKey, setGeneratedApiKey } = useAppTools();
  const [resetPassword, setResetPassword] = useState(false);
  const [pw, setPw] = useState({ password1: "", password2: "" });
  const [totp, setTotp] = useState("");
  const [qrcode, setQrcode] = useState("");
  const [loading, setLoading] = useState({ apiKey: false, password: false });

  const handleGenerateApiKey = async (enable: boolean) => {
    setLoading((l) => ({ ...l, apiKey: true }));
    try {
      const newKey = await setUserApiKey({ data: { enable }, forceRequest: true });
      await updateUserInfo();
      setGeneratedApiKey(enable ? newKey : undefined);
      message.success(t("TXT_CODE_d3de39b4"));
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setLoading((l) => ({ ...l, apiKey: false }));
    }
  };

  const handleChangePassword = async () => {
    if (pw.password1 !== pw.password2) return reportErrorMsg(t("TXT_CODE_d51f5d6"));
    if (pw.password1.length < 9 || pw.password1.length > 36) return reportErrorMsg(t("TXT_CODE_cc5a3aea"));
    setLoading((l) => ({ ...l, password: true }));
    try {
      await updatePassword({ data: { passWord: pw.password1 } });
      message.success(t("TXT_CODE_d3de39b4"));
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setLoading((l) => ({ ...l, password: false }));
    }
  };

  const handleBind2FA = async () => {
    try {
      const code = await bind2FA({ data: {} });
      // SECURITY: only accept an inline image from the panel (CWE-79).
      if (code && SAFE_QR.test(String(code))) {
        setQrcode(String(code));
        await updateUserInfo();
      }
    } catch (err) {
      reportErrorMsg(err);
    }
  };

  const confirm2FACode = async () => {
    try {
      await confirm2FA({ data: { enable: true, TOTPCode: totp } });
    } catch {
      message.error(t("TXT_CODE_3d68e43b"));
      return;
    }
    message.success(t("TXT_CODE_d3de39b4"));
    await updateUserInfo();
    setTotp("");
    setQrcode("");
  };

  const disable2FA = async () => {
    try {
      await confirm2FA({ data: { enable: false, TOTPCode: "000000" } });
      message.success(t("TXT_CODE_d3de39b4"));
      await updateUserInfo();
      setQrcode("");
    } catch (err) {
      reportErrorMsg(err);
    }
  };

  return (
    <Modal open={showUserInfoDialog} centered title={t("TXT_CODE_9bb2f08b")} footer={null} onCancel={() => setShowUserInfoDialog(false)}>
      <Form layout="vertical">
        <Row>
          <Col span={12}><Form.Item label={t("TXT_CODE_eb9fcdad")}><Tag>{user?.userName}</Tag></Form.Item></Col>
          <Col><Form.Item label={t("TXT_CODE_63ccbf90")}><Tag>{permissionLabel(user?.permission)}</Tag></Form.Item></Col>
        </Row>
        <Row>
          <Col span={12}><Form.Item label={t("TXT_CODE_c5c56801")}><Tag>{user?.registerTime}</Tag></Form.Item></Col>
          <Col><Form.Item label={t("TXT_CODE_d7ee9ba")}><Tag>{user?.loginTime}</Tag></Form.Item></Col>
        </Row>
        <Form.Item label={t("TXT_CODE_1d9d0746")}><Tag>{user?.uuid}</Tag></Form.Item>

        <Form.Item label={t("TXT_CODE_551b0348")}>
          {!resetPassword ? (
            <Button danger onClick={() => setResetPassword(true)}>{t("TXT_CODE_50d471b2")}</Button>
          ) : (
            <div>
              <Input.Password className="mb-12" autoComplete="new-password" placeholder={t("TXT_CODE_4f6c39d3")} value={pw.password1} onChange={(e) => setPw((p) => ({ ...p, password1: e.target.value }))} />
              <Input.Password className="mb-12" autoComplete="new-password" placeholder={t("TXT_CODE_37924654")} value={pw.password2} onChange={(e) => setPw((p) => ({ ...p, password2: e.target.value }))} />
              <div><Button loading={loading.password} onClick={handleChangePassword}>{t("TXT_CODE_d507abff")}</Button></div>
            </div>
          )}
        </Form.Item>

        <Form.Item label={t("TXT_CODE_61eae8a6")}>
          {!qrcode ? (
            <div>
              <Button className="mr-8" onClick={handleBind2FA}>{user?.open2FA ? t("TXT_CODE_85a33a84") : t("TXT_CODE_a492ae63")}</Button>
              {user?.open2FA && <Button danger onClick={disable2FA}>{t("TXT_CODE_edd64e4d")}</Button>}
            </div>
          ) : (
            <div>
              <p>
                1. {t("TXT_CODE_cc561947")}<br />2. {t("TXT_CODE_fffce4a8")}<br />3. {t("TXT_CODE_af2a6972")}<br />
              </p>
              <div className="mb-20"><img src={qrcode} alt="2FA QR code" style={{ height: 180, borderRadius: 6 }} /></div>
              <Input className="mb-12" autoComplete="one-time-code" inputMode="numeric" placeholder={t("TXT_CODE_7ac8b1d3")} value={totp} onChange={(e) => setTotp(e.target.value)} />
              <Button onClick={confirm2FACode}>{t("TXT_CODE_b0a18c20")}</Button>
            </div>
          )}
        </Form.Item>

        <Form.Item label="APIKEY">
          <Typography.Paragraph>{t("TXT_CODE_b2dbf778")}</Typography.Paragraph>
          <Typography.Paragraph>
            {generatedApiKey ? (
              <pre className="flex flex-between align-center">{generatedApiKey} <CopyButton size="small" type="text" value={generatedApiKey} /></pre>
            ) : user?.apiKey ? (
              <pre>{t("TXT_CODE_1e7b57ae")}</pre>
            ) : (
              <pre>{t("TXT_CODE_d7dbc7c2")}</pre>
            )}
          </Typography.Paragraph>
          <Button className="mr-10" loading={loading.apiKey} onClick={() => handleGenerateApiKey(true)}>{t("TXT_CODE_d51cd7ae")}</Button>
          {(generatedApiKey || user?.apiKey) && (
            <Popconfirm title={t("TXT_CODE_6819de18")} onConfirm={() => handleGenerateApiKey(false)}>
              <Button danger>{t("TXT_CODE_718c9310")}</Button>
            </Popconfirm>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
}
