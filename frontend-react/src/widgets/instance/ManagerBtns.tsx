/**
 * Instance function tiles: server config, files, mods, Java, RCON, schedules,
 * events, terminal settings, instance settings, ping (port of
 * widgets/instance/ManagerBtns.vue).
 *
 * SECURITY: which tiles show is presentation only; each page and dialog calls
 * a panel route that checks the user's permission for the instance.
 */
import {
  AppstoreAddOutlined,
  ArrowRightOutlined,
  BuildOutlined,
  CodeOutlined,
  ControlOutlined,
  DashboardOutlined,
  FieldTimeOutlined,
  FolderOpenOutlined,
  UsbOutlined,
  UsergroupDeleteOutlined
} from "@ant-design/icons";
import { useEffect, useState, type ComponentType } from "react";
import CardPanel from "@/components/CardPanel";
import InnerCard from "@/components/InnerCard";
import ResponsiveLayoutGroup from "@/components/ResponsiveLayoutGroup";
import { getInstanceConfigByType } from "@/hooks/instanceConfigs";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { TYPE_MINECRAFT_JAVA, TYPE_MINECRAFT_MCDR, TYPE_STEAM_SERVER_UNIVERSAL, useInstanceInfo } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import { modListApi } from "@/services/apis/modManager";
import { useAppState, useCanWebAdmin, useIsAdmin } from "@/stores/appState";
import { arrayFilter } from "@/tools/array";
import type { LayoutCard } from "@/types";
import type { InstanceDetail } from "@/types/instance";
import { openEventConfigDialog } from "./dialogs/EventConfig";
import { openInstanceDetailDialog } from "./dialogs/InstanceDetail";
import { openInstanceFundamentalDetailDialog } from "./dialogs/InstanceFundamentalDetail";
import { openJavaManagerDialog } from "./dialogs/JavaManager";
import { openMcPingSettingsDialog } from "./dialogs/McPingSettings";
import { openRconSettingsDialog } from "./dialogs/RconSettings";
import { openTermConfigDialog } from "./dialogs/TermConfig";
import "./ManagerBtns.scss";

interface Btn {
  title: string;
  icon: ComponentType;
  click: () => void;
  condition?: () => boolean;
}

type DialogOpener = (info: InstanceDetail, instanceId: string, daemonId: string) => Promise<boolean>;

export default function ManagerBtns({ card }: { card: LayoutCard }) {
  const { toPage } = useAppRouters();
  const isAdmin = useIsAdmin();
  const settings = useAppState((s) => s.settings);
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const instanceId = getMetaOrRouteValue("instanceId") ?? "";
  const daemonId = getMetaOrRouteValue("daemonId") ?? "";
  const { instanceInfo, isGlobalTerminal, execute } = useInstanceInfo({ instanceId, daemonId, autoRefresh: true });
  const [modFolders, setModFolders] = useState<string[] | null>(null);
  const type = instanceInfo?.config.type ?? "";
  const canWebAdmin = useCanWebAdmin();
  // Fork rule: the global terminal's files (the panel host) need Web Admin rights;
  // the panel refuses the same request below effectiveLevel(ROLE.WEBADMIN).
  const canFiles = isGlobalTerminal ? canWebAdmin : !!settings.canFileManager || isAdmin;

  useEffect(() => {
    let alive = true;
    modListApi({ params: { uuid: instanceId, daemonId } })
      .then((res) => alive && setModFolders(res?.folders || []))
      .catch(() => alive && setModFolders([]));
    return () => {
      alive = false;
    };
  }, [instanceId, daemonId]);

  const go = (path: string, query: Record<string, string | undefined> = {}) => toPage({ path, query: { ...query, instanceId, daemonId } });
  const openWith = (opener: DialogOpener) => async () => {
    if (!instanceInfo) return;
    // Refresh the card after a save so the next dialog starts from saved values.
    if (await opener(instanceInfo, instanceId, daemonId)) void execute().catch(() => undefined);
  };

  const isMinecraft = type.startsWith("minecraft/java") || type.startsWith("minecraft/bedrock") || type === TYPE_MINECRAFT_MCDR;
  const btns: Btn[] = !instanceInfo
    ? []
    : arrayFilter<Btn>([
        {
          title: t("TXT_CODE_d07742fe"),
          icon: ControlOutlined,
          condition: () => !isGlobalTerminal && getInstanceConfigByType(type).length > 0,
          click: () => go("/instances/terminal/serverConfig", { type })
        },
        { title: t("TXT_CODE_ae533703"), icon: FolderOpenOutlined, click: () => go("/instances/terminal/files"), condition: () => canFiles },
        {
          title: t("TXT_CODE_MOD_MANAGER"),
          icon: UsbOutlined,
          click: () => go("/instances/terminal/mods"),
          // Minecraft servers only, and only when the daemon found a mods/plugins folder.
          condition: () => isMinecraft && canFiles && !!modFolders && modFolders.length > 0
        },
        {
          title: t("TXT_CODE_3fee13ed"),
          icon: BuildOutlined,
          click: openWith(openJavaManagerDialog),
          condition: () => type.includes(TYPE_MINECRAFT_JAVA) && instanceInfo.config.processType === "general"
        },
        { title: t("TXT_CODE_656a85d8"), icon: BuildOutlined, click: openWith(openRconSettingsDialog), condition: () => type.includes(TYPE_STEAM_SERVER_UNIVERSAL) },
        { title: t("TXT_CODE_b7d026f8"), icon: FieldTimeOutlined, condition: () => !isGlobalTerminal, click: () => go("/instances/schedule") },
        { title: t("TXT_CODE_d341127b"), icon: DashboardOutlined, click: openWith(openEventConfigDialog) },
        // Fork rule: terminal options (PTY and similar) are a Web Admin feature.
        { title: t("TXT_CODE_d23631cb"), icon: CodeOutlined, condition: () => canWebAdmin, click: openWith(openTermConfigDialog) },
        { title: t("TXT_CODE_4f34fc28"), icon: AppstoreAddOutlined, condition: () => isAdmin, click: openWith(openInstanceDetailDialog) },
        {
          title: t("TXT_CODE_40241d8e"),
          icon: UsergroupDeleteOutlined,
          click: openWith(openMcPingSettingsDialog),
          condition: () => type.includes(TYPE_MINECRAFT_JAVA) || type === TYPE_MINECRAFT_MCDR
        },
        {
          title: t("TXT_CODE_4f34fc28"),
          icon: AppstoreAddOutlined,
          condition: () => !isAdmin && instanceInfo.config.processType === "docker" && !!settings.allowChangeCmd,
          click: openWith(openInstanceFundamentalDetailDialog)
        }
      ]);

  return (
    <CardPanel className="containerWrapper" style={{ height: "100%" }} title={card.title}>
      <ResponsiveLayoutGroup className="function-btns-container" items={btns}>
        {(item) => (
          <InnerCard style={{ height: 90 }} icon={item.icon} title={item.title} onClick={item.click}>
            <a role="button">
              <span>
                {t("TXT_CODE_6c5985ca")} <ArrowRightOutlined style={{ fontSize: 12 }} />
              </span>
            </a>
          </InnerCard>
        )}
      </ResponsiveLayoutGroup>
    </CardPanel>
  );
}
