/**
 * Shared UI types. These mirror the panel's wire format (common/global.d.ts
 * and frontend/src/types in upstream) so saved layouts and API responses stay
 * compatible with the Vue frontend.
 */

export interface LayoutCardParams {
  field: string;
  label: string;
  type: "string" | "number" | "boolean" | "instance";
}

export interface LayoutCard {
  id: string;
  type: string;
  title: string;
  /** Grid width in twelfths of the row (1-12). */
  width: number;
  /** CSS height, e.g. "200px" or "unset". */
  height: string;
  meta: Record<string, unknown>;
  disableAdd?: boolean;
  onlyPath?: string[];
  params?: LayoutCardParams[];
  followId?: string;
  description?: string;
  allowedPages?: string[] | null;
  line?: number;
  disableDelete?: boolean;
}

export interface PageLayoutConfig {
  page: string;
  items: LayoutCard[];
  theme?: {
    pageTitle: string;
    logoImage: string;
    backgroundImage: string;
    /** "left" = sidebar navigation, "right" = top header only. */
    sidebarPosition?: "left" | "right";
  };
}

export interface PanelStatus {
  isInstall: boolean;
  language: string;
  settings: {
    businessMode: boolean;
    businessId: string;
    canFileManager?: boolean;
    allowUsePreset?: boolean;
    allowChangeCmd?: boolean;
    panelId?: string;
    ssoEnabled?: boolean;
    /** Effective: true only when enforcement is on and a Web Admin exists. */
    webAdminEnforced?: boolean;
    /** Public: the dev-tools blocker must load before login. */
    devBlocker?: boolean;
  };
}

export interface UserInstance {
  instanceUuid: string;
  daemonId: string;
  hostIp?: string;
  remarks?: string;
  status?: number;
  nickname?: string;
  ie?: string;
  oe?: string;
  endTime?: number | string;
  lastDatetime?: number;
  stopCommand?: string;
  processType?: string;
  docker?: Record<string, unknown>;
  info?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BaseUserInfo {
  uuid: string;
  userName: string;
  loginTime: string;
  registerTime: string;
  instances: UserInstance[];
  permission: number;
  apiKey: string;
  isInit: boolean;
  secret: string;
  open2FA: boolean;
  ssoSub: string;
  ssoBound: boolean;
}

export interface LoginUserInfo extends BaseUserInfo {
  /** Per-session anti-CSRF token the panel expects as ?token=. */
  token: string;
}

export interface SsoPublicConfig {
  enabled: boolean;
  onlyMode: boolean;
  autoRedirect: boolean;
  providerName: string;
  iconUrl: string;
}

export enum AppTheme {
  AUTO = 0,
  LIGHT = 1,
  DARK = 2
}
export const THEME_KEY = "THEME_KEY";

/** Panel permission levels (same numbers as upstream ROLE). */
export enum ROLE {
  /** Web Admin/Owner (Johnnykins fork): admin plus panel settings, nodes, images and users when enforced. */
  WEBADMIN = 20,
  ADMIN = 10,
  USER = 1,
  GUEST = 0,
  BAN = -1
}

/** Loose JSON object (upstream types JsonData = IJsonData from common/global.d.ts). */
export type JsonData = IJsonData;
export type MapData<T> = IMapData<T>;

export type QuickStartTemplate = IQuickStartTemplate;
export type QuickStartPackages = IQuickStartPackages;

export interface LabelValueOption {
  label: string;
  value: string;
}
