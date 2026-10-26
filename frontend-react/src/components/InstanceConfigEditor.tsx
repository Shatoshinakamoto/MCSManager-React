/**
 * Key/value editor for a parsed server config file
 * (port of components/InstanceConfigEditor.vue). Keys and descriptions are
 * rendered as text. Only files with a known description map are editable
 * here; others go through the raw file editor.
 */
import { Col, Typography } from "antd";
import { useMemo } from "react";
import CardPanel from "@/components/CardPanel";
import LineOption from "@/components/LineOption";
import { getConfigData } from "@/config/instanceConfigMap";
import { t } from "@/lang/i18n";
import { getDescriptionByTitle, jsonToMap } from "@/tools/common";

/** Description text for a key, or nothing when the map has none (never render an object). */
const describe = (map: Record<string, any>, key: string) => {
  const v = getDescriptionByTitle(map, key);
  return typeof v === "string" ? v : undefined;
};

export default function InstanceConfigEditor({ config, configName }: { config: Record<string, any>; configName: string }) {
  const data = getConfigData()[configName];
  // jsonToMap returns accessors that read and write `config` in place.
  const parsedConfig = useMemo(() => jsonToMap(config) as Record<string, any>, [config]);
  const keys = Object.keys(parsedConfig);

  return (
    <>
      <Col span={24}>
        <CardPanel style={{ height: "100%" }}>
          <Typography>
            <Typography.Title level={5}>{data ? t("TXT_CODE_958fd70c") : t("TXT_CODE_2ce953da")}</Typography.Title>
            <Typography.Paragraph>{data ? data.desc : t("TXT_CODE_75e5af9b")}</Typography.Paragraph>
          </Typography>
        </CardPanel>
      </Col>
      {data && (
        <Col span={24}>
          <CardPanel style={{ height: "100%" }}>
            {Object.keys(config).length > 0 ? (
              <div>
                {keys.map((key) => (
                  <div key={key} className="p-1">
                    <LineOption optionValue={parsedConfig} optionKey={key} title={key} info={describe(data.config, key)} />
                  </div>
                ))}
              </div>
            ) : (
              <div>{t("TXT_CODE_1a730d48")}</div>
            )}
          </CardPanel>
        </Col>
      )}
    </>
  );
}
