/**
 * Name the new instance before installing a market template (port of
 * widgets/instance/dialogs/TemplateNameDialog.vue).
 *
 * Security: template fields come from the market JSON; they render as text and
 * the image only loads from an http(s) URL.
 */
import { Button, Form, Input, Modal } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import { safeHttpUrl } from "@/tools/safeUrl";
import type { QuickStartPackages } from "@/types";
import "./TemplateNameDialog.scss";

function TemplateNameDialog({ template, done }: { template: QuickStartPackages; done: (name: string | undefined) => void }) {
  const [open, setOpen] = useState(true);
  const [form] = Form.useForm<{ instanceName: string }>();
  const close = (name: string | undefined) => {
    setOpen(false);
    done(name);
  };
  const confirm = async () => {
    try {
      const { instanceName } = await form.validateFields();
      close(instanceName);
    } catch {
      /* validation message is shown inline */
    }
  };
  const image = safeHttpUrl(template.image);
  return (
    <Modal open={open} title={t("TXT_CODE_c10ea805")} width={500} footer={null} destroyOnHidden onCancel={() => close(undefined)}>
      <div className="template-info">
        <div className="template-header">
          {image && <img src={image} alt={template.title} className="template-image" referrerPolicy="no-referrer" />}
          <div className="template-details">
            <h3 className="template-title">{template.title}</h3>
            <p className="template-description">{template.description}</p>
            <div className="template-meta">
              <span className="meta-item">
                <strong>{t("TXT_CODE_402018ce")}:</strong> {template.category}
              </span>
              <span className="meta-item">
                <strong>{t("TXT_CODE_3d0885c0")}:</strong> {template.platform}
              </span>
            </div>
          </div>
        </div>
      </div>
      <Form form={form} layout="vertical" className="instance-form">
        <Form.Item
          label={t("TXT_CODE_44ae0e7")}
          name="instanceName"
          validateTrigger={["onChange", "onBlur"]}
          rules={[
            { required: true, message: t("TXT_CODE_cf27ab7e"), validateTrigger: "onBlur" },
            { min: 1, max: 30, message: t("TXT_CODE_6dcaa94d"), validateTrigger: "onBlur" }
          ]}
        >
          <Input placeholder={t("TXT_CODE_cf27ab7e")} maxLength={50} showCount onPressEnter={() => void confirm()} />
        </Form.Item>
      </Form>
      <div className="dialog-footer">
        <Button onClick={() => close(undefined)}>{t("TXT_CODE_a0451c97")}</Button>
        <Button type="primary" onClick={() => void confirm()}>
          {t("TXT_CODE_e4898801")}
        </Button>
      </div>
    </Modal>
  );
}

export function openTemplateNameDialog(template: QuickStartPackages) {
  return openDialog<string | undefined>((done) => <TemplateNameDialog template={template} done={done} />);
}
