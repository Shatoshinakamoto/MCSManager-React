/** Port of NodeRemoteMappingEdit.vue: edit the list of panel -> daemon address mappings. */
import { Button, Col, Input, InputNumber, List, Row, Space } from "antd";
import { t } from "@/lang/i18n";
import type { RemoteMapping } from "@/types/overview";

const DEFAULT_MAPPING = (): RemoteMapping => ({ from: { ip: "", port: 23333, prefix: "" }, to: { ip: "", port: 24444, prefix: "" } });

interface Props {
  value: RemoteMapping[];
  onChange: (v: RemoteMapping[]) => void;
}

export default function NodeRemoteMappingEdit({ value, onChange }: Props) {
  const set = (index: number, side: "from" | "to", key: "ip" | "port" | "prefix", v: string | number) =>
    onChange(value.map((m, i) => (i === index ? { ...m, [side]: { ...m[side], [key]: v } } : m)));
  const add = () => onChange([...value, DEFAULT_MAPPING()]);

  if (value.length === 0) {
    return (
      <Space>
        {t("TXT_CODE_8036ea5e")}
        <Button onClick={add}>{t("TXT_CODE_8d8fbbf4")}</Button>
      </Space>
    );
  }

  const side = (index: number, m: RemoteMapping, s: "from" | "to") => (
    <Space orientation="vertical">
      {t("TXT_CODE_54312194")}
      <Row gutter={8}>
        <Col span={15}>
          <Input.TextArea autoSize value={m[s].ip} onChange={(e) => set(index, s, "ip", e.target.value)} />
        </Col>
        <Col span={9}>
          <InputNumber className="w-full" min={1} max={65535} value={m[s].port} onChange={(v) => set(index, s, "port", Number(v ?? 1))} />
        </Col>
      </Row>
      {t("TXT_CODE_941d83b8")}
      <Row gutter={8}>
        <Col span={24}>
          <Input.TextArea autoSize value={m[s].prefix} onChange={(e) => set(index, s, "prefix", e.target.value)} />
        </Col>
      </Row>
    </Space>
  );

  return (
    <List
      itemLayout="horizontal"
      dataSource={value}
      header={
        <Row className="w-full" gutter={8}>
          <Col className="center-container" span={9}>{t("TXT_CODE_2ee6fd18")}</Col>
          <Col span={2} />
          <Col className="center-container" span={9}>{t("TXT_CODE_6f27624c")}</Col>
          <Col span={4} />
        </Row>
      }
      footer={
        <div className="center-container w-full">
          <Button onClick={add}>{t("TXT_CODE_8d8fbbf4")}</Button>
        </div>
      }
      renderItem={(m, index) => (
        <List.Item>
          <Row className="w-full" gutter={8}>
            <Col span={9}>{side(index, m, "from")}</Col>
            <Col className="center-container" span={2}>-&gt;</Col>
            <Col span={9}>{side(index, m, "to")}</Col>
            <Col className="center-container" span={4}>
              <Button danger onClick={() => onChange(value.filter((_, i) => i !== index))}>
                {t("TXT_CODE_6f2c1806")}
              </Button>
            </Col>
          </Row>
        </List.Item>
      )}
    />
  );
}
