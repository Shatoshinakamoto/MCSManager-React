/**
 * Global session/panel state (React port of upstream useAppStateStore).
 *
 * Holds the logged-in user, install state and public panel settings.
 * Security: `isAdmin` here only decides what the UI shows. Every privileged
 * action is still authorised server-side by the panel (ASVS V4.1.1, NIST AC-3);
 * nothing in this store grants access on its own.
 */
import { create } from "zustand";
import { LANGUAGE_KEY, toStandardLang } from "@/lang/i18n";
import { setTokenProvider } from "@/services/apiService";
import { panelStatus, userInfoApi } from "@/services/apis";
import { ROLE, type LoginUserInfo, type PanelStatus } from "@/types";

interface AppState extends PanelStatus {
  userInfo: LoginUserInfo | null;
  updateUserInfo: (info?: LoginUserInfo | null) => Promise<void>;
  updatePanelStatus: () => Promise<void>;
}

function storedLanguage(): string {
  try {
    return toStandardLang(localStorage.getItem(LANGUAGE_KEY) ?? navigator.language);
  } catch {
    return toStandardLang(navigator.language);
  }
}

export const useAppState = create<AppState>((set, get) => ({
  userInfo: null,
  isInstall: true,
  language: storedLanguage(),
  settings: {
    panelId: "",
    canFileManager: false,
    allowUsePreset: false,
    businessMode: false,
    businessId: "",
    allowChangeCmd: false,
    ssoEnabled: false
  },

  async updateUserInfo(info) {
    const wasLogged = isLoggedIn(get().userInfo);
    const next = info ?? (await userInfoApi());
    if (!next) throw new Error("Failed to get user information from server!");
    set({ userInfo: next });
    // Logged-in users get extra settings from /status, so refresh on login change.
    if (isLoggedIn(next) !== wasLogged) {
      await get().updatePanelStatus().catch((err) => console.error("Panel status refresh failed:", err));
    }
  },

  async updatePanelStatus() {
    const status = await panelStatus();
    const isInstall = status?.isInstall ?? true;
    set((s) => ({
      isInstall,
      settings: { ...s.settings, ...(status?.settings ?? {}) },
      language: isInstall ? toStandardLang(status?.language) : s.language
    }));
  }
}));

// The API client reads the anti-CSRF token from the store without importing it.
setTokenProvider(() => useAppState.getState().userInfo?.token);

export function isLoggedIn(user: LoginUserInfo | null | undefined): boolean {
  return Number(user?.permission) > 0;
}
export function isAdminUser(user: LoginUserInfo | null | undefined): boolean {
  return Number(user?.permission) >= ROLE.ADMIN;
}

export function isWebAdminUser(user: LoginUserInfo | null | undefined): boolean {
  return Number(user?.permission) >= ROLE.WEBADMIN;
}

/**
 * Whether the user may use Web Admin-level features right now. Mirrors the
 * panel's effectiveLevel(): plain admins qualify until enforcement is on.
 */
export function canUseWebAdmin(user: LoginUserInfo | null | undefined, enforced: boolean | undefined): boolean {
  return enforced ? isWebAdminUser(user) : isAdminUser(user);
}
/** Hooks for components. */
export const useIsAdmin = () => useAppState((s) => isAdminUser(s.userInfo));
export const useIsWebAdmin = () => useAppState((s) => isWebAdminUser(s.userInfo));
export const useCanWebAdmin = () => useAppState((s) => canUseWebAdmin(s.userInfo, s.settings.webAdminEnforced));
export const useIsLogged = () => useAppState((s) => isLoggedIn(s.userInfo));
