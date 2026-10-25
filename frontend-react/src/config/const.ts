/** Translated constants (port of config/const.ts). Functions so they resolve after i18n init. */
import { t } from "@/lang/i18n";

export const permissionLabel = (permission: number | string | undefined): string =>
  ({ "1": t("TXT_CODE_eb880db2"), "10": t("TXT_CODE_cd978243"), "-1": t("TXT_CODE_7c76dbf") })[String(permission)] ?? String(permission ?? "");
export const GLOBAL_INSTANCE_UUID = "global0001";
/** Instance list "all daemons" pseudo node id (upstream ALL_DAEMON_MODE). */
export const ALL_DAEMON_MODE = "global";
export const GLOBAL_INSTANCE_NAME = "__MCSM_GLOBAL_INSTANCE__";
