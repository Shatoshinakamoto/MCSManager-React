/**
 * Message bridge between the panel and a page shown in an IframeBox (port of
 * components/IframeBox/config.ts). The framed page posts
 * `{ app: "MCSManager", id, source, data }`; `source` names a handler in
 * handler.ts and the answer goes back as `{ id, source, data }`.
 *
 * SECURITY: upstream answered any page loaded in the box and replied to
 * origin "*". The handlers hand out the user's API key and can change panel
 * settings, so here the bridge is off unless the caller names the framed
 * page's origin in `allowedOrigins` (or the page is on the panel's own
 * origin), every message must come from that frame's window and that origin,
 * and replies are posted to that origin only (CWE-346, CWE-940, OWASP ASVS
 * V14.5). No page in the panel turns it on yet, as upstream.
 */
import { useEffect, type RefObject } from "react";
import { iframeRouters } from "./handler";

export interface IframeEvent {
  id: string;
  source: string;
  data: unknown;
  app: "MCSManager";
}

export interface IframeBoxProps {
  src: string;
  width?: string | number;
  height?: string | number;
  /** Origins whose pages may use the message bridge. Empty: only the panel's own origin. */
  allowedOrigins?: string[];
  /** Turns the message bridge on. Off by default. */
  bridge?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

/** Where upstream's (unreleased) pro panel runs during development. Kept for parity. */
export function getProPanelUrl(path: string) {
  return `http://localhost:5174/#${path}`;
}

/**
 * The origin of `src` when the bridge may talk to it, otherwise null.
 * Only http(s) pages on the panel's origin or in `allowedOrigins` qualify.
 */
export function bridgeOriginFor(src: string, allowedOrigins: string[] = [], here: string = window.location.origin): string | null {
  let origin: string;
  try {
    const url = new URL(src, here);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    origin = url.origin;
  } catch {
    return null;
  }
  const allowed = [here, ...allowedOrigins.map((o) => String(o).trim().replace(/\/+$/, ""))];
  return allowed.includes(origin) ? origin : null;
}

/** Request ids seen in the last 10 s, so a repeated message is answered once (as upstream). */
const recentIds = new Map<string, number>();
const REQUEST_ID_TTL_MS = 10_000;

export function sendIframeMsg(frame: HTMLIFrameElement | null, origin: string, event: Partial<IframeEvent>, result: unknown) {
  // An Error does not survive structured cloning in every browser; send its message.
  const data = result instanceof Error ? { error: result.message } : result;
  frame?.contentWindow?.postMessage({ id: event.id, source: event.source, data }, origin);
}

export async function iframeEventDispatch(event: Partial<IframeEvent>, frame: HTMLIFrameElement | null, origin: string, allowedOrigins: string[]) {
  const id = String(event.id ?? "");
  const handler = Object.prototype.hasOwnProperty.call(iframeRouters, String(event.source)) ? iframeRouters[String(event.source)] : undefined;
  if (!id || typeof handler !== "function" || recentIds.has(id)) return;
  recentIds.set(id, Date.now());
  setTimeout(() => recentIds.delete(id), REQUEST_ID_TTL_MS);
  try {
    sendIframeMsg(frame, origin, event, await handler(event.data, { allowedOrigins }));
  } catch (error) {
    console.error("Iframe router error:", error);
    sendIframeMsg(frame, origin, event, error instanceof Error ? error : new Error(String(error)));
  }
}

/** Listens for bridge messages from `frameRef` while `origin` is set. */
export function useIframeEventListener(frameRef: RefObject<HTMLIFrameElement | null>, origin: string | null, allowedOrigins: string[]) {
  useEffect(() => {
    if (!origin) return;
    const onMessage = (event: MessageEvent) => {
      const cfg = event.data as Partial<IframeEvent> | null;
      if (cfg?.app !== "MCSManager" || !cfg.id) return;
      const frame = frameRef.current;
      if (!frame?.contentWindow || event.source !== frame.contentWindow || event.origin !== origin) return;
      void iframeEventDispatch(cfg, frame, origin, allowedOrigins);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameRef, origin, allowedOrigins]);
}
