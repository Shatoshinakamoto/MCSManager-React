/**
 * Structured editor for one server config file (port of
 * widgets/instance/ServerConfigFile.vue). The daemon parses the file
 * (properties, yml, json, toml, ...) into an object; this page edits that
 * object and sends it back. Ctrl+S saves. "Edit raw file" opens the text
 * editor and reloads afterwards.
 *
 * The config path comes from the route query; the daemon confines it to the
 * instance directory.
 */
import { App, Button, Col, Result, Row } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import BetweenMenus from "@/components/BetweenMenus";
import InstanceConfigEditor from "@/components/InstanceConfigEditor";
import Loading from "@/components/Loading";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { getConfigFile, updateConfigFile } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard } from "@/types";
import { openFileEditor } from "./dialogs/FileEditor";

export default function ServerConfigFile({ card }: { card: LayoutCard }) {
  const { isPhone } = useScreen();
  const { message } = App.useApp();
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const instanceId = getMetaOrRouteValue("instanceId") ?? "";
  const daemonId = getMetaOrRouteValue("daemonId") ?? "";
  const configName = getMetaOrRouteValue("configName", false) ?? "";
  const configPath = getMetaOrRouteValue("configPath", false) ?? "";
  const extName = getMetaOrRouteValue("extName", false) ?? "";
  const type = getMetaOrRouteValue("type", false);
  const { toPage } = useAppRouters();

  const [config, setConfig] = useState<Record<string, any>>();
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const rawEditorOpen = useRef(false);

  const render = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getConfigFile({ forceRequest: true, params: { uuid: instanceId, daemonId, fileName: configPath, type: extName } });
      setConfig(res ?? {});
    } catch (err) {
      setFailed(true);
      reportErrorMsg(err);
    } finally {
      setLoading(false);
    }
  }, [instanceId, daemonId, configPath, extName]);

  useEffect(() => {
    void render();
  }, [render]);

  // Upstream intends to \u-escape non-ASCII values in Java server.properties
  // here, but its loop iterates the wrong object and never runs; the daemon
  // receives values unchanged. That effective behaviour is kept.
  const save = useCallback(async () => {
    if (!config) return;
    setSaving(true);
    try {
      const ok = await updateConfigFile({ forceRequest: true, params: { uuid: instanceId, daemonId, fileName: configPath, type: extName }, data: { ...config } });
      if (ok) message.success(t("TXT_CODE_a7907771"));
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setSaving(false);
    }
  }, [config, instanceId, daemonId, configPath, extName, message]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rawEditorOpen.current || !e.ctrlKey || e.altKey || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      void save();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [save]);

  const toConfigOverview = () => toPage({ path: "/instances/terminal/serverConfig", query: { type } });

  const toEditRawFile = async () => {
    rawEditorOpen.current = true;
    try {
      await openFileEditor({ daemonId, instanceId, path: configPath, fileName: configName });
    } finally {
      rawEditorOpen.current = false;
      setConfig(undefined);
      await render();
    }
  };

  const refresh = async () => {
    await render();
    message.success(t("TXT_CODE_7863f28d"));
  };

  return (
    <div style={{ height: "100%" }} className="container">
      <Row gutter={[24, 24]} style={{ height: "100%" }}>
        {!failed && (
          <Col span={24}>
            <BetweenMenus
              left={!isPhone && <Button onClick={toConfigOverview}>{t("TXT_CODE_c14b2ea3")}</Button>}
              right={
                <>
                  <Button type="primary" loading={saving} onClick={() => void save()}>
                    {t("TXT_CODE_abfe9512")}
                  </Button>
                  <Button loading={loading} onClick={() => void refresh()}>
                    {t("TXT_CODE_b76d94e0")}
                  </Button>
                  <Button type="dashed" onClick={() => void toEditRawFile()}>
                    {t("TXT_CODE_1f61e5a3")}
                  </Button>
                </>
              }
            />
          </Col>
        )}
        {configName && config ? (
          <InstanceConfigEditor config={config} configName={configName} />
        ) : (
          <Col span={24}>{!failed && <Loading />}</Col>
        )}
        {failed && (
          <Col span={24}>
            <Result
              status="error"
              title={t("TXT_CODE_f859eac")}
              subTitle={t("TXT_CODE_b8814f15")}
              extra={
                <Button type="primary" onClick={toConfigOverview}>
                  {t("TXT_CODE_537cd5ad")}
                </Button>
              }
            />
          </Col>
        )}
      </Row>
    </div>
  );
}
