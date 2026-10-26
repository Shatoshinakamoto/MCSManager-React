/**
 * Handlers a bridged IframeBox page can call (port of
 * components/IframeBox/handler.ts). Same names, inputs and answers as
 * upstream: MainAppInfo, OpenNewIframePage, GetRemoteAppDaemons,
 * UpdatePanelSettings, BuyInstance, OpenMarketDialog.
 *
 * SECURITY: these run with the logged-in user's session, so they are only
 * reachable through the origin-checked bridge in config.ts. Differences
 * from upstream:
 * - MainAppInfo and GetRemoteAppDaemons ask the user before creating an API
 *   key; upstream turned one on silently (CWE-284).
 * - OpenNewIframePage opens http(s) pages only, and the new box keeps the
 *   same origin allow-list instead of bridging any page.
 * - Every panel call is still authorised by the panel itself (settings need a
 *   Web Admin, purchases need business mode).
 */
import { modal } from "@/tools/antdStatic";
import { t } from "@/lang/i18n";
import { settingInfo, setSettingInfo } from "@/services/apis/settings";
import { remoteNodeList } from "@/services/apis/instance";
import { requestBuyInstance } from "@/services/apis/redeem";
import { setUserApiKey } from "@/services/apis/user";
import { useAppConfig } from "@/stores/appConfig";
import { useAppState } from "@/stores/appState";
import { safeHttpUrl } from "@/tools/safeUrl";

export interface RemoteAppDaemon {
  nodeId: number | null;
  nickname: string;
  panelAddr: string;
  panelKey: string;
  daemonId: string;
  daemonAddr: string;
  daemonKey: string;
}

interface ReportBuyInstanceData {
  code: string;
  username: string;
  product: IBusinessProductInfo;
}

export interface IframeRouterContext {
  allowedOrigins: string[];
}

export type IframeRouterHandler<T = any> = (data: T, ctx: IframeRouterContext) => Promise<unknown>;

/** The user's API key; turns one on only after the user agrees. */
export async function autoOpenUserApiKey(): Promise<{ apiKey?: string }> {
  const { userInfo, updateUserInfo } = useAppState.getState();
  if (userInfo?.apiKey) return { apiKey: userInfo.apiKey };
  const agreed = await new Promise<boolean>((resolve) =>
    modal.confirm({ title: t("TXT_CODE_IFRAME_APIKEY_TITLE"), content: t("TXT_CODE_IFRAME_APIKEY_DESC"), onOk: () => resolve(true), onCancel: () => resolve(false) })
  );
  if (!agreed) throw new Error(t("TXT_CODE_IFRAME_APIKEY_DENIED"));
  await setUserApiKey({ data: { enable: true }, forceRequest: true, errorAlert: true });
  await updateUserInfo();
  return { apiKey: useAppState.getState().userInfo?.apiKey };
}

export async function getUserInfo() {
  return useAppState.getState().userInfo;
}

export const iframeRouters: Record<string, IframeRouterHandler> = {
  MainAppInfo: async () => {
    const isDarkMode = useAppConfig.getState().isDark;
    try {
      const { apiKey } = await autoOpenUserApiKey();
      const userInfo = await getUserInfo();
      const setting = await settingInfo();
      return {
        isDarkMode,
        panelId: setting?.panelId || "",
        code: setting?.registerCode || "",
        userInfo: { ...JSON.parse(JSON.stringify(userInfo)), apiKey }
      };
    } catch (err) {
      console.warn("MainAppInfo error, we will use default config:", (err as Error)?.message);
      return { isDarkMode, panelId: useAppState.getState().settings.panelId, code: "", userInfo: null };
    }
  },

  OpenNewIframePage: async (data: unknown, ctx) => {
    const src = safeHttpUrl(data);
    if (!src) throw new Error(t("TXT_CODE_SAFE_URL_ONLY"));
    const { openIframeModal } = await import("@/components/IframeModal");
    void openIframeModal({ src, allowedOrigins: ctx.allowedOrigins, bridge: true });
    return true;
  },

  GetRemoteAppDaemons: async (): Promise<RemoteAppDaemon[]> => {
    const { apiKey } = await autoOpenUserApiKey();
    const nodes = (await remoteNodeList()) ?? [];
    return nodes.map((v) => ({
      nickname: v.remarks || `Daemon: ${v.ip}:${v.port}`,
      panelKey: apiKey ?? "",
      daemonId: v.uuid,
      nodeId: null,
      panelAddr: "",
      daemonAddr: "",
      daemonKey: ""
    }));
  },

  UpdatePanelSettings: async (data: { panelId?: string; registerCode?: string } | undefined) => {
    const origin = await settingInfo();
    if (!origin) throw new Error("Panel settings not found");
    // Fills panelId and registerCode only while they are empty, as upstream.
    const patch: { panelId?: string; registerCode?: string } = {};
    if (!origin.panelId && data?.panelId) patch.panelId = String(data.panelId);
    if (!origin.registerCode && data?.registerCode) patch.registerCode = String(data.registerCode);
    if (Object.keys(patch).length) await setSettingInfo({ data: patch });
    return true;
  },

  BuyInstance: async (data: ReportBuyInstanceData) => {
    const res = await requestBuyInstance({
      data: {
        ...data.product,
        code: data.code,
        username: data.username,
        daemonId: data.product.daemonUuid || ""
      }
    });
    return JSON.parse(JSON.stringify(res ?? null));
  },

  OpenMarketDialog: async (data: { daemonId?: string; instanceId?: string; options?: Record<string, unknown> } | undefined) => {
    const { openMarketDialog } = await import("@/widgets/instance/dialogs/MarketDialog");
    const res = await openMarketDialog(data?.daemonId, data?.instanceId, data?.options ?? {});
    return res ? JSON.parse(JSON.stringify(res)) : res;
  }
};
