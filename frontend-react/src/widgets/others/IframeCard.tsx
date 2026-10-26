/**
 * Embedded web page card (port of widgets/others/IframeCard.vue).
 *
 * SECURITY: only http(s) or same-origin URLs are loaded. The frame is
 * sandboxed without allow-top-navigation, so an embedded page cannot
 * redirect the panel tab (CWE-1021); scripts, forms, popups and its own
 * origin stay allowed so ordinary pages keep working. referrerPolicy keeps
 * panel URLs (which carry instance ids) out of the embedded site's logs.
 */
import { FullscreenExitOutlined, FullscreenOutlined } from "@ant-design/icons";
import { Button, Empty, Skeleton } from "antd";
import { useState } from "react";
import CardPanel from "@/components/CardPanel";
import IconBtn from "@/components/IconBtn";
import type { WidgetProps } from "@/config/widgets";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { t } from "@/lang/i18n";
import { useAppTools } from "@/stores/appTools";
import { useLayoutContainer } from "@/stores/layoutContainer";
import { safeHttpUrl } from "@/tools/safeUrl";
import { reportErrorMsg } from "@/tools/validator";
import "./IframeCard.scss";

export const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads";

export default function IframeCard({ card }: WidgetProps) {
  const { getMetaValue, setMetaValue } = useLayoutCardTools(card);
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const openInputDialog = useAppTools((s) => s.openInputDialog);
  const [urlSrc, setUrlSrc] = useState(getMetaValue("url", ""));
  const [fullCard, setFullCard] = useState(Boolean(getMetaValue("full", false)));
  const [loading, setLoading] = useState(true);
  const src = safeHttpUrl(urlSrc);

  const editUrl = async () => {
    try {
      const url = (await openInputDialog(t("TXT_CODE_45364559"))).trim();
      if (url && !safeHttpUrl(url)) return reportErrorMsg(t("TXT_CODE_SAFE_URL_ONLY"));
      setLoading(true);
      setUrlSrc(url);
      setMetaValue("url", url);
    } catch {
      // cancelled
    }
  };

  const toggleFullCard = () => {
    setFullCard(!fullCard);
    setMetaValue("full", !fullCard);
  };

  const rows = parseInt(String(card.height)[0]) * 2 || 4;

  return (
    <div className="IframeCard" style={{ width: "100%", height: "100%", position: "relative" }}>
      {src ? (
        <CardPanel
          style={{ backdropFilter: "blur()" }}
          title={
            <>
              {card.title}
              {isDesignMode && (
                <Button className="ml-10" type="primary" size="small" onClick={() => void editUrl()}>
                  {t("TXT_CODE_78930f0f")}
                </Button>
              )}
            </>
          }
          operator={
            isDesignMode ? (
              <IconBtn
                icon={fullCard ? FullscreenExitOutlined : FullscreenOutlined}
                title={fullCard ? t("TXT_CODE_2818a7bc") : t("TXT_CODE_52ba5942")}
                onClick={toggleFullCard}
              />
            ) : undefined
          }
        >
          {loading && <Skeleton active paragraph={{ rows }} />}
          <iframe
            key={src}
            src={src}
            title={card.title}
            sandbox={IFRAME_SANDBOX}
            referrerPolicy="no-referrer"
            onLoad={() => setLoading(false)}
            style={{ height: card.height, width: "100%", zIndex: isDesignMode ? -1 : 1, display: loading ? "none" : undefined, border: 0 }}
            className={fullCard ? "full-card-iframe" : undefined}
          />
        </CardPanel>
      ) : (
        <CardPanel style={{ height: "100%" }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span>{t("TXT_CODE_6239c6b6")}</span>}>
            <Button type="primary" onClick={() => void editUrl()}>
              {t("TXT_CODE_dde54f31")}
            </Button>
          </Empty>
        </CardPanel>
      )}
    </div>
  );
}
