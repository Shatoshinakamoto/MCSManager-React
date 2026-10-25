/**
 * i18n setup for the React port.
 *
 * Reuses the repository's shared /languages/*.json files (same keys as the
 * Vue frontend, panel and daemon), so translations stay in one place.
 * Upstream used vue-i18n, whose placeholders are `{name}`; i18next is
 * configured with the same single-brace syntax so no file needs rewriting.
 *
 * Security: i18next's own HTML escaping is disabled because React already
 * escapes every interpolated string when rendering text (CWE-79). Never pass a
 * translated string to dangerouslySetInnerHTML without markdownToHTML().
 */
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

// DO NOT I18N. Same list and order as upstream.
export const SUPPORTED_LANGS = [
  { label: "English", value: "en_us" },
  { label: "简体中文", value: "zh_cn" },
  { label: "繁體中文", value: "zh_tw" },
  { label: "日本語", value: "ja_jp" },
  { label: "Русский", value: "ru_ru" },
  { label: "Deutsch", value: "de_de" },
  { label: "Français", value: "fr_fr" },
  { label: "Português Brasileiro", value: "pt_br" },
  { label: "Thai", value: "th_th" },
  { label: "Español", value: "es_es" },
  { label: "한국어", value: "ko_kr" },
  { label: "Türkçe", value: "tr_tr" }
];

export const LANGUAGE_KEY = "LANGUAGE";

/** Normalise "en-US" / "en_US" to the panel's "en_us" form. */
export function toStandardLang(lang?: string | null): string {
  if (!lang) return "en_us";
  return lang.replace("-", "_").toLowerCase();
}

/** Look up a language file loader by normalised language code. */
const langFiles = import.meta.glob<{ default: Record<string, string> }>("../../../languages/*.json");
function findLoader(lang: string) {
  const path = Object.keys(langFiles).find((p) => toStandardLang(p).includes(`/${lang}.json`));
  return path ? langFiles[path] : undefined;
}

/**
 * Load the requested language plus English (fallback) and initialise i18next.
 * @param lang language code, any casing/separator
 */
export async function initI18n(lang: string): Promise<void> {
  const current = toStandardLang(lang);
  const resources: Record<string, { translation: Record<string, string> }> = {};
  for (const code of new Set([current, "en_us"])) {
    const loader = findLoader(code);
    if (loader) resources[code] = { translation: (await loader()).default };
  }
  await i18next.use(initReactI18next).init({
    resources,
    lng: resources[current] ? current : "en_us",
    fallbackLng: "en_us",
    // Match vue-i18n `{name}` placeholders used in /languages/*.json.
    interpolation: { prefix: "{", suffix: "}", escapeValue: false },
    returnNull: false
  });
}

/** Translate outside React components (stores, route config, toasts). */
export function t(key: string, options?: Record<string, unknown>): string {
  return String(i18next.t(key, options ?? {}));
}

/** Current language code. */
export function getCurrentLang(): string {
  return toStandardLang(i18next.language);
}

/** Persist the choice and reload so every module re-reads translated constants. */
export function setLanguage(lang: string): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, toStandardLang(lang));
  } catch {
    /* storage may be blocked; the panel default language still applies */
  }
  window.location.reload();
}

/**
 * Switch language without a reload (used by the install wizard, like
 * upstream setLanguage(lang, false)). Components re-render through
 * react-i18next's useTranslation().
 */
export async function changeLanguageInPlace(lang: string): Promise<void> {
  const code = toStandardLang(lang);
  if (!i18next.hasResourceBundle(code, "translation")) {
    const loader = findLoader(code);
    if (!loader) return;
    i18next.addResourceBundle(code, "translation", (await loader()).default);
  }
  await i18next.changeLanguage(code);
}
