/**
 * Theme and branding state (React port of upstream useAppConfigStore).
 *
 * Applies the same body classes (app-light-theme / app-dark-theme and the
 * background-image extend themes) so the copied SCSS renders identically.
 *
 * Security: the background image URL comes from admin-editable layout settings.
 * It is only accepted if it is an http(s) or same-origin path and is escaped
 * before going into a CSS url(), so a crafted value cannot break out of the
 * declaration (CWE-79 via CSS injection).
 */
import { theme as antTheme, type ThemeConfig } from "antd";
import { create } from "zustand";
import logo from "@/assets/logo.png";
import { AppTheme, THEME_KEY } from "@/types";
import { SETTINGS_PAGE, useLayoutConfig } from "./layoutConfig";

interface AppConfigState {
  currentTheme: AppTheme;
  isDark: boolean;
  logoImage: string;
  hasBgImage: boolean;
  sidebarPosition: "left" | "right";
  themeConfig: ThemeConfig;
  setTheme: (t: AppTheme) => void;
  initAppTheme: () => void;
}

const BASE_TOKEN = { fontSizeLG: 14, fontSizeSM: 12, fontSizeXL: 18 };

function readTheme(): AppTheme {
  try {
    const v = Number(localStorage.getItem(THEME_KEY));
    return v >= AppTheme.AUTO && v <= AppTheme.DARK ? v : AppTheme.LIGHT;
  } catch {
    return AppTheme.LIGHT;
  }
}

const prefersDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

/** Return a CSS-safe url() argument or null if the URL is not allowed. */
export function safeCssUrl(url: string): string | null {
  const trimmed = url.trim();
  // SECURITY: allow-list schemes; rejects javascript:, data:, expression() tricks.
  if (!/^(https?:\/\/|\/|\.\/)/i.test(trimmed)) return null;
  // SECURITY: escape characters that could terminate url("...") (CWE-79).
  return `"${trimmed.replace(/["\\\n\r]/g, (c) => "\\" + c.charCodeAt(0).toString(16) + " ")}"`;
}

export const useAppConfig = create<AppConfigState>((set, get) => ({
  currentTheme: readTheme(),
  isDark: false,
  logoImage: logo,
  hasBgImage: false,
  sidebarPosition: "right",
  themeConfig: { algorithm: antTheme.defaultAlgorithm, token: BASE_TOKEN },

  setTheme(t) {
    try {
      localStorage.setItem(THEME_KEY, String(t));
    } catch {
      /* storage blocked: theme applies for this tab only */
    }
    set({ currentTheme: t });
    get().initAppTheme();
  },

  initAppTheme() {
    const t = get().currentTheme;
    const isDark = t === AppTheme.DARK || (t === AppTheme.AUTO && prefersDark());
    document.body.classList.toggle("app-dark-theme", isDark);
    document.body.classList.toggle("app-light-theme", !isDark);

    const settings = useLayoutConfig.getState().pages.find((p) => p.page === SETTINGS_PAGE);
    let hasBgImage = false;
    const bg = settings?.theme?.backgroundImage ? safeCssUrl(settings.theme.backgroundImage) : null;
    if (bg) {
      const body = document.body;
      body.style.backgroundSize = "cover";
      body.style.backgroundPosition = "center";
      body.style.backgroundRepeat = "no-repeat";
      body.style.backgroundImage = isDark
        ? `linear-gradient(135deg, rgba(0,0,0,0.65), rgba(0,0,0,0.65) 100%), url(${bg})`
        : `linear-gradient(135deg, rgba(220,220,220,0.3), rgba(53,53,53,0.3) 100%), url(${bg})`;
      body.classList.toggle("app-dark-extend-theme", isDark);
      body.classList.toggle("app-light-extend-theme", !isDark);
      hasBgImage = true;
    }
    const pos = settings?.theme?.sidebarPosition;
    set({
      isDark,
      hasBgImage,
      logoImage: settings?.theme?.logoImage || logo,
      sidebarPosition: pos === "left" || pos === "right" ? pos : "right",
      themeConfig: { algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm, token: BASE_TOKEN }
    });
  }
}));
