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
  };
}

export interface UserInstance {
  instanceUuid: string;
  daemonId: string;
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
  ADMIN = 10,
  USER = 1,
  GUEST = 0
}
