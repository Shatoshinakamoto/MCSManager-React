/** Port of upstream hooks/useCardTools.ts: read card meta, falling back to the route query. */
import { useSearchParams } from "react-router";
import { t } from "@/lang/i18n";
import type { LayoutCard } from "@/types";

export function useLayoutCardTools(card: LayoutCard) {
  const [query] = useSearchParams();
  const getMetaValue = <T,>(key: string, def?: T): T => (card.meta?.[key] ?? def) as T;
  const getMetaOrRouteValue = (key: string, require = true): string | undefined => {
    if (card.meta?.[key] != null) return String(card.meta[key]);
    const q = query.get(key);
    if (q != null) return q;
    if (require) throw new Error([t("TXT_CODE_93a70cda"), `"${key}"`, t("TXT_CODE_2222777e")].join(" "));
    return undefined;
  };
  return { getMetaValue, getMetaOrRouteValue };
}
