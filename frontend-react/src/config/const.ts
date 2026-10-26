/** Translated constants (port of config/const.ts). Functions so they resolve after i18n init. */
import { t } from "@/lang/i18n";

/** Permission level labels in upstream PERMISSION_MAP order (value is the panel's number as a string). */
export const permissionMap = (): Record<string, string> => ({
  "1": t("TXT_CODE_eb880db2"),
  "20": t("TXT_CODE_cd9782433"),
  "10": t("TXT_CODE_cd978243"),
  "-1": t("TXT_CODE_7c76dbf")
});

export const permissionLabel = (permission: number | string | undefined): string =>
  permissionMap()[String(permission)] ?? String(permission ?? "");
export const GLOBAL_INSTANCE_UUID = "global0001";
/** Instance list "all daemons" pseudo node id (upstream ALL_DAEMON_MODE). */
export const ALL_DAEMON_MODE = "global";
export const GLOBAL_INSTANCE_NAME = "__MCSM_GLOBAL_INSTANCE__";

/** How long after a start request the console waits before reporting a crash (ms). */
export const INSTANCE_CRASH_TIMEOUT = 2000;
