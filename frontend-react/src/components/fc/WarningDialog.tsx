/**
 * Port of components/fc/WarningDialog.vue: a centered warning the user must
 * acknowledge with a checkbox before Confirm is enabled.
 *
 * openWarningDialog resolves true on Confirm and false on Cancel (upstream
 * rejected on cancel; callers here check the boolean instead).
 */
import { Button, Checkbox, Modal, Typography } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";

interface Props {
  title: string;
  subTitle: string;
  checkText: string;
  done: (ok: boolean) => void;
}

function WarningDialog({ title, subTitle, checkText, done }: Props) {
  const [open, setOpen] = useState(true);
  const [checked, setChecked] = useState(false);
  const close = (ok: boolean) => {
    setOpen(false);
    done(ok);
  };
  return (
    <Modal open={open} centered width={600} title="" mask={{ closable: false }} closable={false} footer={null} onCancel={() => close(false)}>
      <div className="dialog-overflow-container">
        <div className="flex flex-center">
          <div>
            <Typography.Paragraph>
              <Typography.Title level={4}>
                <div className="flex flex-center mb-24">{title}</div>
              </Typography.Title>
              <Typography.Text>
                <div className="flex flex-center" style={{ gap: 10 }}>
                  {/* Rendered as text: instance names come from other users (CWE-79). */}
                  <pre>{subTitle}</pre>
                </div>
              </Typography.Text>
            </Typography.Paragraph>
            <div className="justify-center mb-24">
              <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)}>
                {checkText}
              </Checkbox>
            </div>
            <div className="flex justify-center">
              <Button className="mr-12" danger disabled={!checked} onClick={() => close(true)}>
                {t("TXT_CODE_d507abff")}
              </Button>
              <Button onClick={() => close(false)}>{t("TXT_CODE_a0451c97")}</Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function openWarningDialog(props: Omit<Props, "done">): Promise<boolean> {
  return openDialog<boolean>((done) => <WarningDialog {...props} done={done} />);
}
