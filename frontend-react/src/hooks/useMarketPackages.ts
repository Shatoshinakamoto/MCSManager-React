/**
 * App market package list and filters (port of upstream hooks/useMarketPackages.ts).
 *
 * The package list comes from the market data source configured in Settings
 * (any admin-chosen URL), fetched by the panel. Treat every field as
 * untrusted text; image URLs are filtered with safeHttpUrl where rendered.
 */
import { useCallback, useMemo, useState } from "react";
import type { ComputedNode } from "@/types/overview";
import { getCurrentLang, t } from "@/lang/i18n";
import { quickInstallListAddr } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { QuickStartPackages } from "@/types";

export const SEARCH_ALL_KEY = "ALL";

export interface FilterOption {
  label: string;
  value: string;
}

export interface SearchForm {
  language: string;
  category: string;
  gameType: string;
  platform: string;
  keyword: string;
  isSupportDocker: boolean;
  system: "win" | "linux";
}

export const matchesLanguage = (item: Pick<QuickStartPackages, "language">, language: string) =>
  language === SEARCH_ALL_KEY || item.language === language || item.language === "en_us";

const matchesField = (item: QuickStartPackages, field: keyof QuickStartPackages, value: string) =>
  value === SEARCH_ALL_KEY || item[field] === value || item[field] === SEARCH_ALL_KEY;

const matchesKeyword = (item: QuickStartPackages, keyword: string) => {
  const k = keyword?.trim().toLowerCase() ?? "";
  if (!k) return true;
  return [item.title ?? "", item.description ?? ""].some((s) => String(s).toLowerCase().includes(k));
};

function optionsFor(items: QuickStartPackages[], field: keyof QuickStartPackages, allLabel: string): FilterOption[] {
  const map: Record<string, string> = {};
  for (const item of items) {
    const v = item[field] as string;
    if (!map[v]) map[v] = v;
  }
  map[SEARCH_ALL_KEY] = allLabel;
  return Object.keys(map).map((key) => ({ label: map[key] || "", value: key }));
}

export function useMarketPackages({ onlyDockerTemplate = false }: { onlyDockerTemplate?: boolean } = {}) {
  const [packages, setPackages] = useState<QuickStartPackages[]>([]);
  const [loading, setLoading] = useState(false);
  const [languageOptions, setLanguageOptions] = useState<FilterOption[]>([
    { label: "简体中文", value: "zh_cn" },
    { label: "English", value: "en_us" }
  ]);
  const [searchForm, setSearchForm] = useState<SearchForm>(() => ({
    language: getCurrentLang(),
    category: SEARCH_ALL_KEY,
    gameType: SEARCH_ALL_KEY,
    platform: SEARCH_ALL_KEY,
    keyword: "",
    isSupportDocker: false,
    system: "linux"
  }));
  const patchSearch = useCallback((p: Partial<SearchForm>) => setSearchForm((f) => ({ ...f, ...p })), []);

  const filtered = useCallback(
    (extra?: (item: QuickStartPackages) => boolean) =>
      packages.filter((item) => {
        if (onlyDockerTemplate && !item.setupInfo?.docker && !item?.dockerOptional) return false;
        if (extra) return extra(item);
        return (
          matchesLanguage(item, searchForm.language) &&
          matchesField(item, "gameType", searchForm.gameType) &&
          matchesField(item, "category", searchForm.category) &&
          matchesField(item, "platform", searchForm.platform) &&
          matchesKeyword(item, searchForm.keyword)
        );
      }),
    [packages, onlyDockerTemplate, searchForm]
  );

  /** In category view, collapse templates into one summary card per gameType (upstream getSummaryPackages). */
  const filteredList = useMemo(() => {
    const list = filtered();
    if (searchForm.gameType !== SEARCH_ALL_KEY) return list;
    const map = new Map<string, QuickStartPackages>();
    for (const item of list) {
      const existing = map.get(item.gameType);
      if (!existing) {
        map.set(item.gameType, {
          ...item,
          key: JSON.stringify({
            title: item.title,
            language: item.language,
            platform: item.platform,
            gameType: item.gameType,
            targetLink: item.targetLink,
            category: item.category
          }),
          description: "",
          title: item.gameType,
          category: "",
          runtime: "",
          size: "",
          hardware: "",
          remark: "",
          targetLink: undefined,
          author: "",
          setupInfo: undefined as unknown as IGlobalInstanceConfig,
          tags: undefined,
          isSummary: true
        });
      } else if (existing.platform !== item.platform) {
        existing.platform = "All";
      }
    }
    return Array.from(map.values());
  }, [filtered, searchForm.gameType]);

  const gameTypeOptions = useMemo(
    () => optionsFor(filtered((i) => matchesLanguage(i, searchForm.language)), "gameType", t("TXT_CODE_107695d")),
    [filtered, searchForm.language]
  );

  const categoryOptions = useMemo(
    () =>
      optionsFor(
        filtered((i) => matchesLanguage(i, searchForm.language) && matchesField(i, "gameType", searchForm.gameType)),
        "category",
        t("TXT_CODE_2af87548")
      ),
    [filtered, searchForm.language, searchForm.gameType]
  );

  /** What the market editor saves or downloads: the full, unfiltered template file. */
  const rawList = useMemo<IQuickStartTemplate>(() => ({ languages: languageOptions, packages }), [languageOptions, packages]);

  const handleReset = useCallback(
    () => patchSearch({ language: SEARCH_ALL_KEY, gameType: SEARCH_ALL_KEY, category: SEARCH_ALL_KEY, platform: SEARCH_ALL_KEY, keyword: "" }),
    [patchSearch]
  );
  const handleLanguageChange = useCallback(
    (language: string) => patchSearch({ language, gameType: SEARCH_ALL_KEY, category: SEARCH_ALL_KEY, platform: SEARCH_ALL_KEY }),
    [patchSearch]
  );
  const handleGameTypeChange = useCallback(
    (gameType: string) => patchSearch({ gameType, category: SEARCH_ALL_KEY, platform: SEARCH_ALL_KEY }),
    [patchSearch]
  );
  const handlePlatformChange = useCallback((platform: string) => patchSearch({ platform, category: SEARCH_ALL_KEY }), [patchSearch]);

  const platformOptions = useMemo(
    () =>
      optionsFor(
        filtered((i) => matchesLanguage(i, searchForm.language) && matchesField(i, "gameType", searchForm.gameType)),
        "platform",
        t("TXT_CODE_47203b64")
      ),
    [filtered, searchForm.language, searchForm.gameType]
  );

  const handleSelectTopCategory = useCallback(
    (item: QuickStartPackages, node?: ComputedNode) => {
      const platform = String(node?.system?.type).toLowerCase().includes("windows") ? "Windows" : SEARCH_ALL_KEY;
      patchSearch({ gameType: item.gameType, isSupportDocker: !!node?.dockerPlatforms?.length, platform });
    },
    [patchSearch]
  );

  const fetchTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const list = await quickInstallListAddr();
      // With no market source the panel answers `[]`; keep the default language list then (the classic UI shows "English").
      if (Array.isArray(list?.languages)) setLanguageOptions(list!.languages);
      setPackages(Array.isArray(list?.packages) ? list!.packages : []);
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    packages,
    setPackages,
    languageOptions,
    setLanguageOptions,
    searchForm,
    patchSearch,
    appListLoading: loading,
    setAppListLoading: setLoading,
    filteredList,
    rawList,
    gameTypeOptions,
    categoryOptions,
    platformOptions,
    handleReset,
    handleLanguageChange,
    handleGameTypeChange,
    handlePlatformChange,
    handleSelectTopCategory,
    fetchTemplate
  };
}
