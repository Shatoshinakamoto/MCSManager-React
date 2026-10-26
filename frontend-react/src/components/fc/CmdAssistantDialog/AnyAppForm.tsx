/** Generic program form of the command assistant (port of CmdAssistantDialog/AnyAppForm.vue). */
import { Form, Input, Typography, type FormInstance } from "antd";
import type { AnyAppCmdForm } from "@/hooks/startCmdBuilder";
import { t } from "@/lang/i18n";

export default function AnyAppForm({ form, initial }: { form: FormInstance<AnyAppCmdForm>; initial: AnyAppCmdForm }) {
  return (
    <Form form={form} layout="vertical" initialValues={initial}>
      <Form.Item name="softwarePath" label={t("TXT_CODE_c7b1b8d0")} rules={[{ required: true, whitespace: true }]}>
        <Input placeholder={t("TXT_CODE_a2a0e054")} />
      </Form.Item>
      <Form.Item label={t("TXT_CODE_b9442311")}>
        <Form.Item name="params" noStyle>
          <Input placeholder={t("TXT_CODE_2a379a13")} />
        </Form.Item>
        <div className="mt-6">
          <Typography.Text type="secondary">{t("TXT_CODE_d705a2bd")}</Typography.Text>
        </div>
      </Form.Item>
    </Form>
  );
}
