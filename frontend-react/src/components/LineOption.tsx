/**
 * One editable config key row (port of components/LineOption.vue).
 *
 * `optionValue` is the accessor map from jsonToMap: reading and writing
 * `optionValue[optionKey]` goes straight to the parsed config object, so
 * the parent saves that object as is. Booleans get a Yes/No select that can
 * be switched to free text; long and float values keep the daemon's
 * "<__long__>" / "<__float__>" type markers while the user edits the number.
 */
import { EditOutlined } from "@ant-design/icons";
import { Button, Card, Col, Input, Row, Select } from "antd";
import { useState, type ReactNode } from "react";
import { t } from "@/lang/i18n";
import "./LineOption.scss";

const LONG_MAGIC_PREFIX = "<__long__>";
const FLOAT_MAGIC_PREFIX = "<__float__>";

enum CONTROL {
  SELECT = 1,
  INPUT = 2
}

interface Props {
  optionValue?: Record<string, any>;
  optionKey?: string;
  custom?: boolean;
  title?: ReactNode;
  info?: ReactNode;
  optionInput?: ReactNode;
  children?: ReactNode;
}

const strip = (v: unknown) => {
  if (typeof v !== "string") return v;
  if (v.startsWith(LONG_MAGIC_PREFIX)) return v.replace(LONG_MAGIC_PREFIX, "");
  if (v.startsWith(FLOAT_MAGIC_PREFIX)) return v.replace(FLOAT_MAGIC_PREFIX, "");
  return v;
};

export default function LineOption({ optionValue, optionKey, custom, title, info, optionInput, children }: Props) {
  const map = optionValue ?? {};
  const key = optionKey ?? "";
  const [type, setType] = useState(() => (typeof map[key] === "boolean" ? CONTROL.SELECT : CONTROL.INPUT));
  const [shown, setShown] = useState<unknown>(() => strip(map[key]));

  const write = (v: unknown) => {
    const pre = map[key];
    if (typeof pre === "string" && pre.startsWith(LONG_MAGIC_PREFIX)) map[key] = `${LONG_MAGIC_PREFIX}${v}`;
    else if (typeof pre === "string" && pre.startsWith(FLOAT_MAGIC_PREFIX)) map[key] = `${FLOAT_MAGIC_PREFIX}${v}`;
    else map[key] = v;
    setShown(strip(map[key]));
  };

  // antd Select values cannot be booleans; map them through strings.
  const boolValue = shown === true ? "true" : shown === false ? "false" : undefined;

  return (
    <div className="line-option-wrapper">
      <Card className="line-option-card" styles={{ body: { padding: 10 } }}>
        {!custom ? (
          <Row gutter={[10, 10]} align="middle">
            <Col md={7} span={24}>
              {title}
            </Col>
            <Col md={11} span={24}>
              {info}
            </Col>
            <Col md={6} span={24}>
              {optionInput ? (
                <div>{optionInput}</div>
              ) : (
                <div className="flex">
                  {type == CONTROL.INPUT && <Input value={shown == null ? "" : String(shown)} onChange={(e) => write(e.target.value)} />}
                  {type == CONTROL.SELECT && (
                    <>
                      <Select
                        value={boolValue}
                        style={{ width: "100%" }}
                        placeholder={t("TXT_CODE_fe3f34e6")}
                        onChange={(v) => write(v === "true")}
                        options={[
                          { value: "true", label: t("TXT_CODE_addfcb6b") },
                          { value: "false", label: t("TXT_CODE_1e9c479e") }
                        ]}
                      />
                      <Button className="ml-8" onClick={() => setType(CONTROL.INPUT)}>
                        <EditOutlined />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </Col>
          </Row>
        ) : (
          <div>{children}</div>
        )}
      </Card>
    </div>
  );
}
