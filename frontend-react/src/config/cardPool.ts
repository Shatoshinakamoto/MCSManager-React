/**
 * Cards offered by the design-mode "add card" dialog (port of
 * getLayoutCardPool in upstream config/index.ts). Same types, sizes, metas,
 * params, categories and permissions, so added cards are saved in the same
 * shape the Vue UI writes.
 */
import { t } from "@/lang/i18n";
import { getRandomId } from "@/tools/common";
import { ROLE, type LayoutCard, type LayoutCardParams } from "@/types";

export enum NEW_CARD_TYPE {
  COMMON = "COMMON",
  INSTANCE = "INSTANCE",
  DATA = "DATA",
  USER = "USER",
  OTHER = "OTHER"
}

export enum LayoutCardHeight {
  MINI = "100px",
  SMALL = "200px",
  MEDIUM = "400px",
  BIG = "600px",
  LARGE = "800px",
  AUTO = "unset"
}

export interface NewCardItem extends LayoutCard {
  category: NEW_CARD_TYPE;
  permission: ROLE;
}

const instanceParams = (): LayoutCardParams[] => [
  { field: "instanceId", label: t("TXT_CODE_e6a5c12b"), type: "string" },
  { field: "daemonId", label: t("TXT_CODE_72cfab69"), type: "string" },
  { field: "instance", label: t("TXT_CODE_cb043d10"), type: "instance" }
];

type Def = [type: string, titleKey: string, descKey: string, width: number, height: LayoutCardHeight, category: NEW_CARD_TYPE, permission: ROLE, meta?: Record<string, unknown>, params?: () => LayoutCardParams[]];

const { COMMON, INSTANCE, DATA, OTHER } = NEW_CARD_TYPE;
const H = LayoutCardHeight;

// Order matches upstream.
const DEFS: Def[] = [
  ["EmptyCard", "TXT_CODE_b23e2bab", "TXT_CODE_b3e2f83e", 2, H.MINI, COMMON, ROLE.GUEST],
  ["TitleCard", "TXT_CODE_8981d724", "TXT_CODE_9466852b", 12, H.AUTO, COMMON, ROLE.GUEST],
  ["Terminal", "TXT_CODE_71a51d19", "TXT_CODE_10a6d36f", 6, H.BIG, INSTANCE, ROLE.USER, { viewType: "card" }, instanceParams],
  ["StatusBlock", "TXT_CODE_b4a9d04a", "TXT_CODE_55ade942", 3, H.SMALL, DATA, ROLE.ADMIN, { type: "node" }],
  ["StatusBlock", "TXT_CODE_88e9361a", "TXT_CODE_55ade942", 3, H.SMALL, DATA, ROLE.ADMIN, { type: "instance" }],
  ["StatusBlock", "TXT_CODE_db64faf6", "TXT_CODE_55ade942", 3, H.SMALL, DATA, ROLE.ADMIN, { type: "users" }],
  ["StatusBlock", "TXT_CODE_48382669", "TXT_CODE_55ade942", 3, H.SMALL, DATA, ROLE.ADMIN, { type: "system" }],
  ["Settings", "TXT_CODE_b5c7b82d", "TXT_CODE_e78047a5", 8, H.MEDIUM, OTHER, ROLE.ADMIN],
  ["ImageBox", "TXT_CODE_4d993ca4", "TXT_CODE_6ef5195f", 4, H.SMALL, COMMON, ROLE.GUEST],
  ["Carousel", "TXT_CODE_5a196078", "TXT_CODE_6ef5195f", 4, H.SMALL, COMMON, ROLE.GUEST],
  ["IframeCard", "TXT_CODE_3ed96265", "TXT_CODE_db9375a5", 4, H.SMALL, COMMON, ROLE.GUEST],
  ["TextCard", "TXT_CODE_ddcca0b9", "TXT_CODE_2ca42b39", 4, H.SMALL, COMMON, ROLE.GUEST],
  ["LinkCard", "TXT_CODE_745d8a03", "TXT_CODE_d6a96ea4", 4, H.SMALL, COMMON, ROLE.GUEST],
  ["ClockCard", "TXT_CODE_af143e18", "TXT_CODE_cf9e259c", 4, H.SMALL, COMMON, ROLE.GUEST],
  ["MusicCard", "TXT_CODE_660e2341", "TXT_CODE_903a9ec9", 4, H.SMALL, COMMON, ROLE.GUEST],
  ["InstanceShortcut", "TXT_CODE_ea0840c9", "TXT_CODE_3fce7ccb", 3, H.SMALL, INSTANCE, ROLE.USER, {}, instanceParams],
  ["InstanceFileManager", "TXT_CODE_72cce10b", "TXT_CODE_f49b2787", 12, H.MEDIUM, INSTANCE, ROLE.USER, {}, instanceParams],
  ["InstanceBaseInfo", "TXT_CODE_eadb4f60", "TXT_CODE_97e5eccb", 4, H.SMALL, INSTANCE, ROLE.USER, {}, instanceParams],
  ["RequestChart", "TXT_CODE_a4037a98", "TXT_CODE_6f659da2", 6, H.MINI, DATA, ROLE.ADMIN],
  ["InstanceChart", "TXT_CODE_d6d9c42c", "TXT_CODE_6f659da2", 6, H.MINI, DATA, ROLE.ADMIN],
  ["NodeOverview", "TXT_CODE_4bedec2a", "TXT_CODE_2a8dc13f", 12, H.BIG, DATA, ROLE.ADMIN],
  ["OperationLogCard", "TXT_CODE_f6a33629", "TXT_CODE_9e8c176e", 3, H.MEDIUM, DATA, ROLE.ADMIN],
  ["AuditLog", "TXT_CODE_ea1600d2", "TXT_CODE_fe933494", 12, H.AUTO, DATA, ROLE.ADMIN],
  ["DataOverview", "TXT_CODE_721157a3", "TXT_CODE_55ade942", 8, H.MEDIUM, DATA, ROLE.ADMIN],
  ["QuickStart", "TXT_CODE_e01539f1", "TXT_CODE_d628e631", 4, H.MEDIUM, INSTANCE, ROLE.ADMIN],
  ["NodeItem", "TXT_CODE_def287e0", "TXT_CODE_abe0862e", 6, H.MEDIUM, INSTANCE, ROLE.ADMIN, {}, () => [
    { field: "daemonId", label: t("TXT_CODE_72cfab69"), type: "string" },
    { field: "instance", label: t("TXT_CODE_e7cad65f"), type: "instance" }
  ]],
  ["InstanceManagerBtns", "TXT_CODE_d2bbb2f1", "TXT_CODE_1934114b", 8, H.MEDIUM, INSTANCE, ROLE.USER, {}, instanceParams],
  ["PluginCard", "TXT_CODE_5ebec0db", "TXT_CODE_cb84b22", 4, H.SMALL, COMMON, ROLE.GUEST],
  ["Market", "TXT_CODE_27594db8", "TXT_CODE_9b45858c", 12, H.BIG, OTHER, ROLE.ADMIN],
  ["MarketEditor", "TXT_CODE_54275b9c", "TXT_CODE_94f55150", 12, H.BIG, OTHER, ROLE.ADMIN]
];

/** Fresh card pool with new random ids each call (like upstream). */
export function getLayoutCardPool(): NewCardItem[] {
  return DEFS.map(([type, titleKey, descKey, width, height, category, permission, meta, params]) => ({
    id: getRandomId(),
    type,
    title: t(titleKey),
    description: t(descKey),
    width,
    height,
    category,
    permission,
    meta: { ...(meta ?? {}) },
    ...(params ? { params: params() } : {})
  }));
}
