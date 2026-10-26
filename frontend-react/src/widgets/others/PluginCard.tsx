/**
 * HTML plugin card (port of widgets/others/PluginCard.vue).
 *
 * Two ways to run a plugin, both in an iframe sandboxed without
 * allow-same-origin (opaque origin: no panel cookies, storage or DOM, no
 * navigation of the panel tab):
 * - Frame mode: the plugin page loads directly from its own http(s) URL. It
 *   gets the theme as { type: "mcsmanager:theme", theme } after loading.
 * - Old plugin API mode: for plugins written for upstream's in-page plugin
 *   card. The card loads the panel's plugin host (public/plugin-host.html),
 *   fetches the plugin HTML and hands it over; the host recreates
 *   window.$axios, $theme, $realWindow, $onMounted and $onUnmounted inside the
 *   frame. Panel API calls come back here as messages and are answered by
 *   tools/legacyPluginBridge.ts: nothing by default, or allow-listed
 *   read-only GETs when an admin turns on panel data for this card.
 *
 * SECURITY: upstream wrote the plugin into the panel page with innerHTML and
 * ran its scripts with the real window and the logged-in session, so a plugin
 * controlled the panel (CWE-94, CWE-829). Neither mode restores that; the
 * panel's own CSP stays without 'unsafe-eval'. Messages are only accepted
 * from this card's own frame.
 */
import { Button, Space, Switch, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import CardPanel from "@/components/CardPanel";
import { openUploadFileDialog, PLUGIN_HTML_ACCEPT } from "@/components/fc/UploadFileDialog";
import type { WidgetProps } from "@/config/widgets";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { t } from "@/lang/i18n";
import { rawPanelGet } from "@/services/apiService";
import { useAppConfig } from "@/stores/appConfig";
import { useAppTools } from "@/stores/appTools";
import { useLayoutContainer } from "@/stores/layoutContainer";
import {
  BridgeRateLimiter,
  checkBridgeRequest,
  fetchPluginHtml,
  isBridgeRequest,
  isUploadedPlugin,
  legacyPluginSource,
  pluginBaseUrl,
  type PluginApiAccess
} from "@/tools/legacyPluginBridge";
import { safeAbsoluteHttpUrl } from "@/tools/safeUrl";
import { reportErrorMsg } from "@/tools/validator";
import "./PluginCard.scss";

export const PLUGIN_SANDBOX = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";
/** Served by the panel from frontend-react/public with its own CSP (panel middleware/additional_security.ts). */
export const PLUGIN_HOST_PATH = "./plugin-host.html";

export default function PluginCard({ card }: WidgetProps) {
  const { getMetaValue, setMetaValue } = useLayoutCardTools(card);
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const currentTheme = useAppConfig((s) => s.currentTheme);
  const openInputDialog = useAppTools((s) => s.openInputDialog);
  const [originUrl, setOriginUrl] = useState(getMetaValue("url", ""));
  // Panel uploads only ever worked as old-style plugins, so they default to the old API.
  const [legacy, setLegacy] = useState<boolean>(getMetaValue<boolean | undefined>("legacyApi", undefined) ?? isUploadedPlugin(String(originUrl)));
  const [apiAccess, setApiAccess] = useState<PluginApiAccess>(getMetaValue<PluginApiAccess>("apiAccess", "none") === "read" ? "read" : "none");
  const [loadError, setLoadError] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const limiter = useRef(new BridgeRateLimiter());

  const legacySource = legacy ? legacyPluginSource(originUrl) : undefined;
  const frameSrc = legacy ? undefined : safeAbsoluteHttpUrl(originUrl);
  const shownUrl = legacySource ?? frameSrc;

  const post = useCallback((msg: unknown) => frame.current?.contentWindow?.postMessage(msg, "*"), []);

  const saveUrl = (url: string) => {
    setOriginUrl(url);
    setMetaValue("url", url);
  };

  const setUrl = async () => {
    try {
      const url = (await openInputDialog(t("TXT_CODE_45364559"))).trim();
      if (url && !safeAbsoluteHttpUrl(url)) return reportErrorMsg(t("TXT_CODE_PLUGIN_URL_ONLY"));
      saveUrl(url);
    } catch {
      // cancelled
    }
  };

  const uploadHtml = async () => {
    const path = await openUploadFileDialog(PLUGIN_HTML_ACCEPT);
    if (!path) return;
    saveUrl(path);
    setLegacy(true);
    setMetaValue("legacyApi", true);
  };

  const changeLegacy = (on: boolean) => {
    setLegacy(on);
    setMetaValue("legacyApi", on);
  };

  const changeAccess = (on: boolean) => {
    const v: PluginApiAccess = on ? "read" : "none";
    setApiAccess(v);
    setMetaValue("apiAccess", v);
  };

  // Theme changes reach both kinds of plugin.
  useEffect(() => {
    post({ type: "mcsmanager:theme", theme: String(currentTheme) });
  }, [currentTheme, post]);

  // Old plugin API: hand the plugin to the host, answer its panel calls.
  useEffect(() => {
    if (isDesignMode || !legacySource) return;
    let alive = true;
    const onMessage = async (event: MessageEvent) => {
      // SECURITY: only this card's frame, which is always an opaque origin.
      if (!frame.current || event.source !== frame.current.contentWindow || event.origin !== "null") return;
      const m = event.data as { type?: unknown };
      if (m?.type === "mcsmanager:plugin-ready") {
        try {
          const html = await fetchPluginHtml(legacySource);
          if (!alive) return;
          post({
            type: "mcsmanager:load",
            html,
            theme: String(currentTheme),
            panelOrigin: window.location.origin,
            baseUrl: pluginBaseUrl(legacySource, window.location.href)
          });
        } catch (err) {
          if (alive) setLoadError(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      if (!isBridgeRequest(m)) return;
      const reply = (status: number, data: unknown) => post({ type: "mcsmanager:api-result", id: m.id, status, data });
      if (!limiter.current.take()) return reply(429, { status: 429, data: "Too many requests from this plugin." });
      const decision = checkBridgeRequest(m, apiAccess);
      if (!decision.ok) return reply(decision.status, { status: decision.status, data: decision.message });
      try {
        const res = await rawPanelGet(decision.path, decision.params);
        if (alive) reply(res.status, res.data);
      } catch (err) {
        if (alive) reply(502, { status: 502, data: err instanceof Error ? err.message : "Request failed" });
      }
    };
    const listener = (e: MessageEvent) => void onMessage(e);
    window.addEventListener("message", listener);
    const target = frame.current;
    return () => {
      alive = false;
      window.removeEventListener("message", listener);
      target?.contentWindow?.postMessage({ type: "mcsmanager:unmount" }, "*");
    };
    // currentTheme is read once at load; later changes go through the theme effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesignMode, legacySource, apiAccess, post]);

  return (
    <CardPanel title={<div className="flex">{card.title}</div>}>
      <div className="PluginCard plugin-card-container">
        {isDesignMode ? (
          <div>
            <Typography.Paragraph>
              <p>
                {t("TXT_CODE_c565b2e0")}
                <br />
                {t("TXT_CODE_6750d9d3")}
                <br />
                {t("TXT_CODE_PLUGIN_SANDBOX_NOTE")}
              </p>
              {shownUrl && <div>{t("TXT_CODE_6345aa71")}</div>}
              {shownUrl && (
                <div className="mt-16 mb-16">
                  <a href={isUploadedPlugin(shownUrl) ? "." + shownUrl : shownUrl} target="_blank" rel="noopener noreferrer">
                    {shownUrl}
                  </a>
                </div>
              )}
              <Space wrap className="mt-8">
                <Button type="primary" onClick={() => void setUrl()}>
                  {t("TXT_CODE_PLUGIN_URL_BTN")}
                </Button>
                <Button onClick={() => void uploadHtml()}>{t("TXT_CODE_40a87804")}</Button>
              </Space>
              <div className="mt-16">
                <Space>
                  <Switch checked={legacy} onChange={changeLegacy} />
                  <Typography.Text>{t("TXT_CODE_PLUGIN_LEGACY_API")}</Typography.Text>
                </Space>
                <div>
                  <Typography.Text type="secondary">{t("TXT_CODE_PLUGIN_LEGACY_API_DESC")}</Typography.Text>
                </div>
              </div>
              {legacy && (
                <div className="mt-16">
                  <Space>
                    <Switch checked={apiAccess === "read"} onChange={changeAccess} />
                    <Typography.Text>{t("TXT_CODE_PLUGIN_API_READ")}</Typography.Text>
                  </Space>
                  <div>
                    <Typography.Text type="warning">{t("TXT_CODE_PLUGIN_API_READ_DESC")}</Typography.Text>
                  </div>
                </div>
              )}
            </Typography.Paragraph>
          </div>
        ) : loadError ? (
          <Typography.Text type="danger">{loadError}</Typography.Text>
        ) : legacySource ? (
          <iframe
            ref={frame}
            key={`legacy:${legacySource}:${apiAccess}`}
            src={PLUGIN_HOST_PATH}
            title={card.title}
            className="html-plugin-container"
            sandbox={PLUGIN_SANDBOX}
            referrerPolicy="no-referrer"
          />
        ) : (
          frameSrc && (
            <iframe
              ref={frame}
              key={frameSrc}
              src={frameSrc}
              title={card.title}
              className="html-plugin-container"
              sandbox={PLUGIN_SANDBOX}
              referrerPolicy="no-referrer"
              onLoad={() => post({ type: "mcsmanager:theme", theme: String(currentTheme) })}
            />
          )
        )}
      </div>
    </CardPanel>
  );
}
