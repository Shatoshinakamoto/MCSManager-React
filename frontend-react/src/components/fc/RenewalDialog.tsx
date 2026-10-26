/**
 * Renewal-code dialog for business-mode instances (port of
 * components/fc/RenewalDialog.vue). Shown from the terminal page when the
 * instance has a product category.
 *
 * SECURITY: the code is trimmed and length-capped before it is sent; the
 * panel validates it again and checks it with the redeem service (CWE-20).
 * The code is never logged or stored in the browser.
 */
import { Button, Form, Input, Modal, Typography } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";
import { requestBuyInstance } from "@/services/apis/redeem";
import { message } from "@/tools/antdStatic";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";

/** Longest code accepted in the field; redeem codes are far shorter. */
export const MAX_RENEWAL_CODE_LENGTH = 128;

interface Props {
  instanceId: string;
  daemonId: string;
  productId: number;
  done: (renewed: boolean) => void;
}

export function RenewalDialog({ instanceId, daemonId, productId, done }: Props) {
  const [open, setOpen] = useState(true);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const close = (renewed: boolean) => {
    setOpen(false);
    setCode("");
    done(renewed);
  };

  const submit = async () => {
    const value = code.trim();
    if (!value || loading) return;
    setLoading(true);
    try {
      // forceRequest: a redeem must never be answered from the short response cache.
      await requestBuyInstance({ data: { instanceId, daemonId, code: value, productId }, forceRequest: true });
      message.success(t("TXT_CODE_ae51f93b"));
      close(true);
    } catch (error) {
      reportErrorMsg(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} centered width={500} title={t("TXT_CODE_f77093c8")} footer={null} onCancel={() => close(false)}>
      <div className="dialog-overflow-container" style={{ maxHeight: "60vh", overflowY: "auto" }}>
        <Form layout="vertical">
          <Typography.Paragraph>{t("TXT_CODE_2432f4cc")}</Typography.Paragraph>
          <Form.Item required>
            <Input
              value={code}
              maxLength={MAX_RENEWAL_CODE_LENGTH}
              autoComplete="off"
              placeholder={t("TXT_CODE_b3cc1379")}
              size="large"
              onChange={(e) => setCode(e.target.value)}
              onPressEnter={() => void submit()}
            />
          </Form.Item>
          <div className="text-center mt-20 flex justify-center" style={{ gap: 8 }}>
            <Button type="primary" loading={loading} disabled={!code.trim()} onClick={() => void submit()}>
              {t("TXT_CODE_bc560b9")}
            </Button>
          </div>
        </Form>
      </div>
    </Modal>
  );
}

/** Opens the dialog; resolves true after a successful renewal. */
export function openRenewalDialog(instanceId: string, daemonId: string, productId: number) {
  return openDialog<boolean>((done) => <RenewalDialog instanceId={instanceId} daemonId={daemonId} productId={productId} done={done} />);
}
