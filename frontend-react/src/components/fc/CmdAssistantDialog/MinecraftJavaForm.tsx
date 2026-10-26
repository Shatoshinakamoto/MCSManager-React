/** Minecraft Java form of the command assistant (port of CmdAssistantDialog/MinecraftJavaForm.vue). */
import { Col, Form, Input, Row, type FormInstance } from "antd";
import type { MinecraftJavaCmdForm } from "@/hooks/startCmdBuilder";
import { t } from "@/lang/i18n";

export default function MinecraftJavaForm({ form, initial }: { form: FormInstance<MinecraftJavaCmdForm>; initial: MinecraftJavaCmdForm }) {
  return (
    <Form form={form} layout="vertical" initialValues={initial}>
      <Form.Item name="jarName" label={t("TXT_CODE_58508fb7")} rules={[{ required: true, whitespace: true }]}>
        <Input placeholder={t("TXT_CODE_84f760fa")} />
      </Form.Item>
      <Row gutter={[24, 24]}>
        <Col span={12}>
          <Form.Item name="maxMemory" label={t("TXT_CODE_dd238854")}>
            <Input placeholder={t("TXT_CODE_d7fa3be3")} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="minMemory" label={t("TXT_CODE_e050b3be")}>
            <Input placeholder={t("TXT_CODE_57c1b0a3")} />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item name="javaPath" label={t("TXT_CODE_43422ed3")}>
            <Input placeholder={t("TXT_CODE_7f9b6758")} />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item name="additional" label={t("TXT_CODE_4efba567")}>
            <Input placeholder={t("TXT_CODE_f79563ef")} />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item name="suffix" label={t("TXT_CODE_85770d4a")}>
            <Input placeholder={t("TXT_CODE_6e3da823")} />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}
