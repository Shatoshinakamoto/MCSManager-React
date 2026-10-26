/** Port of upstream hooks/useCardTools.ts: read card meta, falling back to the route query. */
import { useLocation, useSearchParams } from "react-router";
import { t } from "@/lang/i18n";
import { useLayoutConfig } from "@/stores/layoutConfig";
import type { LayoutCard } from "@/types";

export function useLayoutCardTools(card: LayoutCard) {
  const [query] = useSearchParams();
  const { pathname } = useLocation();
  const getMetaValue = <T,>(key: string, def?: T): T => (card.meta?.[key] ?? def) as T;
  /**
   * Upstream mutated card.meta in place; here the layout store is updated, so
   * the value is kept when design mode saves the layout (same as upstream).
   * Reads the latest card from the store so two quick writes do not race.
   */
  const setMetaValue = <T,>(key: string, value: T) => {
    const store = useLayoutConfig.getState();
    const current = store.getPageItems(pathname).find((c) => c.id === card.id);
    store.updateItem(pathname, card.id, { meta: { ...(current?.meta ?? card.meta ?? {}), [key]: value } });
  };
  const getMetaOrRouteValue = (key: string, require = true): string | undefined => {
    if (card.meta?.[key] != null) return String(card.meta[key]);
    const q = query.get(key);
    if (q != null) return q;
    if (require) throw new Error([t("TXT_CODE_93a70cda"), `"${key}"`, t("TXT_CODE_2222777e")].join(" "));
    return undefined;
  };
  return { getMetaValue, setMetaValue, getMetaOrRouteValue };
}
