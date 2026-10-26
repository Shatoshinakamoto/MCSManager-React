/**
 * Framed page with a load-error message and a retry button (port of
 * components/IframeBox/index.vue). Adds `?theme=light|dark&t=<now>` to the
 * address as upstream, so the framed page can match the panel theme and is
 * not served from cache.
 *
 * SECURITY: the frame uses the same sandbox as the iframe card (no top-level
 * navigation of the panel tab, CWE-1021) and sends no referrer. The message
 * bridge (config.ts) stays off unless `bridge` is set and the page's origin is
 * allowed.
 */
import { Button } from "antd";
import { useMemo, useRef, useState } from "react";
import { t } from "@/lang/i18n";
import { useAppConfig } from "@/stores/appConfig";
import { IFRAME_SANDBOX } from "@/widgets/others/IframeCard";
import { bridgeOriginFor, useIframeEventListener, type IframeBoxProps } from "./config";
import "./index.scss";

const EMPTY: string[] = [];

/** Adds theme and cache-busting parameters, keeping any query or hash the address has. */
export function iframeAddress(src: string, dark: boolean, now = Date.now()): string {
  const [base, hash] = src.split("#", 2);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}theme=${dark ? "dark" : "light"}&t=${now}${hash !== undefined ? `#${hash}` : ""}`;
}

export default function IframeBox({ src, width = "100%", height = "100%", allowedOrigins = EMPTY, bridge = false, onLoad, onError }: IframeBoxProps) {
  const isDark = useAppConfig((s) => s.isDark);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState("");
  // Changing the key remounts the frame, which is how "retry" reloads it.
  const [nonce, setNonce] = useState(() => Date.now());
  const address = useMemo(() => iframeAddress(src, isDark, nonce), [src, isDark, nonce]);
  const origin = bridge ? bridgeOriginFor(src, allowedOrigins) : null;
  useIframeEventListener(frameRef, origin, allowedOrigins);

  const size = { width, height };
  return (
    <div className="iframe-box" style={size}>
      <iframe
        key={nonce}
        ref={frameRef}
        title={src}
        className="iframe-content"
        style={size}
        src={address}
        sandbox={IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
        onLoad={() => {
          setError("");
          onLoad?.();
        }}
        onError={() => {
          setError(t("TXT_CODE_ef8f8e29"));
          onError?.();
        }}
      />
      {error && (
        <div className="iframe-error">
          <p>{t("TXT_CODE_ef8f8e29")}</p>
          <p>{error}</p>
          <Button type="primary" onClick={() => setNonce(Date.now())}>
            {t("TXT_CODE_9277af78")}
          </Button>
        </div>
      )}
    </div>
  );
}
