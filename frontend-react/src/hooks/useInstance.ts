/**
 * Instance helpers (port of upstream hooks/useInstance.ts, list-related part).
 * The instance config file list (INSTANCE_CONFIGS) moves over with the
 * Phase 2 instance pages.
 */
import { createElement, useCallback, useEffect, useRef, useState } from "react";
import type { HookAPI } from "antd/es/modal/useModal";
import { message } from "@/tools/antdStatic";
import { GLOBAL_INSTANCE_NAME } from "@/config/const";
import { reportErrorMsg } from "@/tools/validator";
import { t } from "@/lang/i18n";
import { getConfigFile, getInstanceInfo, updateConfigFile } from "@/services/apis/instance";
import { INSTANCE_STATUS_CODE, instanceStatusLabels, type InstanceDetail, type InstanceMoreDetail } from "@/types/instance";

export const TYPE_UNIVERSAL = "universal";
export const TYPE_WEB_SHELL = "universal/web_shell";
export const TYPE_MINECRAFT_MCDR = "universal/mcdr";
export const TYPE_MINECRAFT_JAVA = "minecraft/java";
export const TYPE_MINECRAFT_BUKKIT = "minecraft/java/bukkit";
export const TYPE_MINECRAFT_SPIGOT = "minecraft/java/spigot";
export const TYPE_MINECRAFT_PAPER = "minecraft/java/paper";
export const TYPE_MINECRAFT_FOLIA = "minecraft/java/folia";
export const TYPE_MINECRAFT_LEAVES = "minecraft/java/leaves";
export const TYPE_MINECRAFT_PUFFERFISH = "minecraft/java/pufferfish";
export const TYPE_MINECRAFT_FORGE = "minecraft/java/forge";
export const TYPE_MINECRAFT_NEOFORGE = "minecraft/java/neoforge";
export const TYPE_MINECRAFT_FABRIC = "minecraft/java/fabric";
export const TYPE_MINECRAFT_BUNGEECORD = "minecraft/java/bungeecord";
export const TYPE_MINECRAFT_VELOCITY = "minecraft/java/velocity";
export const TYPE_MINECRAFT_GEYSER = "minecraft/java/geyser";
export const TYPE_MINECRAFT_SPONGE = "minecraft/java/sponge";
export const TYPE_MINECRAFT_MOHIST = "minecraft/java/mohist";
export const TYPE_MINECRAFT_PURPUR = "minecraft/java/purpur";
export const TYPE_MINECRAFT_BEDROCK = "minecraft/bedrock";
export const TYPE_MINECRAFT_BDS = "minecraft/bedrock/bds";
export const TYPE_MINECRAFT_NUKKIT = "minecraft/bedrock/nukkit";
export const TYPE_HYTALE = "hytale";
export const TYPE_STEAM_SERVER_UNIVERSAL = "steam/universal";
export const TYPE_TERRARIA = "steam/terraria";

/** Instance type labels. A function so translations resolve after i18n init. */
export const instanceTypeTranslation = (): Record<string, string> => ({
  [TYPE_UNIVERSAL]: t("TXT_CODE_a92a4aa1"),
  [TYPE_STEAM_SERVER_UNIVERSAL]: t("TXT_CODE_3d7fbe30"),
  [TYPE_MINECRAFT_JAVA]: t("TXT_CODE_97f779b3"),
  [TYPE_MINECRAFT_BEDROCK]: t("TXT_CODE_7f1aef9f"),
  [TYPE_MINECRAFT_NUKKIT]: t("TXT_CODE_8f3e5807"),
  [TYPE_MINECRAFT_SPIGOT]: t("TXT_CODE_6c08319b"),
  [TYPE_MINECRAFT_PAPER]: t("TXT_CODE_ec0cda88"),
  [TYPE_MINECRAFT_FOLIA]: t("TXT_CODE_de449b5f"),
  [TYPE_MINECRAFT_LEAVES]: t("TXT_CODE_8a5305a6"),
  [TYPE_MINECRAFT_PUFFERFISH]: t("TXT_CODE_c6d3bd8"),
  [TYPE_MINECRAFT_BUNGEECORD]: t("TXT_CODE_ba86f4a"),
  [TYPE_MINECRAFT_VELOCITY]: t("TXT_CODE_a3abb092"),
  [TYPE_MINECRAFT_PURPUR]: t("TXT_CODE_e543f6c0"),
  [TYPE_MINECRAFT_BDS]: t("TXT_CODE_67b5f678"),
  [TYPE_MINECRAFT_SPONGE]: t("TXT_CODE_e4dbff32"),
  [TYPE_MINECRAFT_FORGE]: t("TXT_CODE_5112fcb2"),
  [TYPE_MINECRAFT_NEOFORGE]: t("TXT_CODE_98b4ac74"),
  [TYPE_MINECRAFT_MOHIST]: t("TXT_CODE_82e624d1"),
  [TYPE_MINECRAFT_FABRIC]: t("TXT_CODE_7af6d85a"),
  [TYPE_MINECRAFT_BUKKIT]: t("TXT_CODE_992bf9bc"),
  [TYPE_MINECRAFT_GEYSER]: t("TXT_CODE_4f57868"),
  [TYPE_MINECRAFT_MCDR]: t("TXT_CODE_fa6f95a1"),
  [TYPE_HYTALE]: t("TXT_CODE_2025658e"),
  [TYPE_WEB_SHELL]: t("TXT_CODE_31c5a4d0"),
  [TYPE_TERRARIA]: t("TXT_CODE_f25df30a")
});

/** Derived flags and labels for one instance (pure; upstream computed refs). */
export function describeInstance(info?: InstanceDetail) {
  const status = info?.status;
  return {
    isUnknown: status === INSTANCE_STATUS_CODE.BUSY,
    isStopped: status === INSTANCE_STATUS_CODE.STOPPED,
    isStopping: status === INSTANCE_STATUS_CODE.STOPPING,
    isStarting: status === INSTANCE_STATUS_CODE.STARTING,
    isRunning: status === INSTANCE_STATUS_CODE.RUNNING,
    isGlobalTerminal: info?.config?.nickname === GLOBAL_INSTANCE_NAME,
    instanceTypeText: instanceTypeTranslation()[String(info?.config?.type)] || t("TXT_CODE_da7a0328"),
    statusText: String(instanceStatusLabels()[(status ?? -1) as INSTANCE_STATUS_CODE] ?? "") || t("TXT_CODE_c8333afa")
  };
}

/** Attach `moreInfo` (upstream useInstanceMoreDetail). Returns a new object. */
export function instanceMoreDetail(info: InstanceDetail): InstanceMoreDetail {
  const d = describeInstance(info);
  return {
    ...info,
    moreInfo: { statusText: d.statusText, isRunning: d.isRunning, isStopped: d.isStopped, instanceTypeText: d.instanceTypeText }
  };
}

interface Params {
  instanceId?: string;
  daemonId?: string;
  autoRefresh?: boolean;
  /** When given, no request is made and this record is described instead. */
  instanceInfo?: InstanceDetail;
}

/**
 * Load (and optionally poll every 3 s) one instance, like upstream useInstanceInfo.
 * Polling stops on unmount.
 */
export function useInstanceInfo({ instanceId, daemonId, autoRefresh, instanceInfo }: Params) {
  const [state, setState] = useState<InstanceDetail | undefined>(undefined);
  const [isLoading, setLoading] = useState(false);
  const alive = useRef(true);

  const execute = useCallback(async () => {
    if (!instanceId || !daemonId) return;
    setLoading(true);
    try {
      const res = await getInstanceInfo({ params: { uuid: instanceId, daemonId } });
      if (alive.current) setState(res);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [instanceId, daemonId]);

  useEffect(() => {
    alive.current = true;
    if (instanceInfo || !instanceId || !daemonId) return;
    void execute().catch(() => undefined);
    const task = autoRefresh ? setInterval(() => void execute().catch(() => undefined), 3000) : undefined;
    return () => {
      alive.current = false;
      if (task) clearInterval(task);
    };
  }, [execute, autoRefresh, instanceInfo, instanceId, daemonId]);

  const info = instanceInfo ?? state;
  return { ...describeInstance(info), instanceInfo: info, isLoading, execute };
}

/**
 * Ask the user to accept the Minecraft EULA when eula.txt says false.
 * @param modal antd modal API from App.useApp() so the dialog follows the theme.
 * @returns false if the user declined.
 */
export async function verifyEULA(instanceId: string, daemonId: string, modal: HookAPI): Promise<boolean> {
  const params = { uuid: instanceId, daemonId, fileName: "eula.txt", type: "properties" };
  const data = await getConfigFile({ params }).catch(() => null);
  if (data?.eula !== false) return true;
  // SECURITY: upstream injected the translated text with innerHTML; here the
  // link is a React element and the text is escaped (CWE-79).
  const [before, after = ""] = t("TXT_CODE_e0a944a1", { 0: "\u0000" }).split("\u0000");
  const content = createElement(
    "div",
    null,
    before,
    createElement("a", { href: "https://www.minecraft.net/eula", target: "_blank", rel: "noopener noreferrer" }, "Minecraft EULA"),
    after
  );
  return new Promise<boolean>((resolve) => {
    modal.confirm({
      title: t("TXT_CODE_617ce69c"),
      content,
      okText: t("TXT_CODE_e456aed"),
      mask: { closable: false },
      onOk: async () => {
        try {
          await updateConfigFile({ params, data: { eula: true } });
          message.success(t("TXT_CODE_525e6e18"));
          resolve(true);
        } catch (err) {
          // Upstream left the promise pending here; report and treat as declined.
          reportErrorMsg(err);
          resolve(false);
        }
      },
      onCancel: () => resolve(false)
    });
  });
}
