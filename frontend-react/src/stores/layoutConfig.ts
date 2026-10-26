/**
 * Page layouts served by the panel (/api/overview/layout).
 *
 * The JSON shape is identical to the Vue frontend's, so layouts customised in
 * either UI load in the other. Security: the blob is admin-writable, so it is
 * parsed with JSON.parse (no eval) and validated before use (CWE-502/CWE-20);
 * unknown card types render a placeholder instead of arbitrary components.
 */
import { create } from "zustand";
import { getLayoutConfig, resetLayoutConfig, setLayoutConfig } from "@/services/apis/layout";
import type { LayoutCard, PageLayoutConfig } from "@/types";

export const SETTINGS_PAGE = "__settings__";

interface LayoutConfigState {
  pages: PageLayoutConfig[];
  setPages: (pages: PageLayoutConfig[]) => void;
  getPageItems: (page: string) => LayoutCard[];
  deleteItem: (page: string, id: string) => void;
  insertItem: (page: string, card: LayoutCard, index?: number) => void;
  moveItem: (page: string, sourceId: string, targetId: string, newArea?: boolean) => void;
  updateItem: (page: string, id: string, patch: Partial<LayoutCard>) => void;
  save: () => Promise<void>;
  reset: () => Promise<void>;
}

/**
 * Validate the layout blob shape. Drops malformed entries rather than
 * trusting them (CWE-20).
 */
export function parseLayoutConfig(raw: unknown): PageLayoutConfig[] {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(value)) return [];
  return value
    .filter((p) => p && typeof p.page === "string" && Array.isArray(p.items))
    .map((p) => ({
      ...p,
      items: p.items.filter(
        (c: LayoutCard) =>
          c && typeof c.id === "string" && typeof c.type === "string" && Number.isFinite(Number(c.width))
      )
    }));
}

const updatePage = (pages: PageLayoutConfig[], page: string, fn: (items: LayoutCard[]) => LayoutCard[]) =>
  pages.map((p) => (p.page === page ? { ...p, items: fn([...p.items]) } : p));

const NO_ITEMS: LayoutCard[] = [];

export const useLayoutConfig = create<LayoutConfigState>((set, get) => ({
  pages: [],
  setPages: (pages) => set({ pages }),
  // A shared empty array keeps the selector result stable for pages with no
  // saved layout; a fresh [] each call made React loop on /user and /customer.
  getPageItems: (page) => get().pages.find((p) => p.page === page)?.items ?? NO_ITEMS,
  deleteItem: (page, id) => set((s) => ({ pages: updatePage(s.pages, page, (items) => items.filter((c) => c.id !== id)) })),
  insertItem: (page, card, index) =>
    set((s) => ({
      pages: updatePage(s.pages, page, (items) => {
        items.splice(index ?? items.length, 0, card);
        return items;
      })
    })),
  // Same index arithmetic as upstream useCardDragMove.moveCardItem.
  moveItem: (page, sourceId, targetId, newArea = false) =>
    set((s) => ({
      pages: updatePage(s.pages, page, (items) => {
        if (!sourceId || sourceId === targetId) return items;
        const from = items.findIndex((c) => c.id === sourceId);
        let to = items.findIndex((c) => c.id === targetId);
        if (from < 0) return items;
        const [card] = items.splice(from, 1);
        if (newArea && from > to) to += 1;
        items.splice(to < 0 ? items.length : to, 0, card);
        return items;
      })
    })),
  updateItem: (page, id, patch) =>
    set((s) => ({ pages: updatePage(s.pages, page, (items) => items.map((c) => (c.id === id ? { ...c, ...patch } : c))) })),
  async save() {
    await setLayoutConfig({ data: JSON.stringify(get().pages) });
  },
  async reset() {
    await resetLayoutConfig();
  }
}));

/** Fetch layouts at startup and set the document title from __settings__. */
export async function initLayoutConfig(defaultTitle: string): Promise<void> {
  try {
    const pages = parseLayoutConfig(await getLayoutConfig());
    useLayoutConfig.getState().setPages(pages);
    const settings = pages.find((p) => p.page === SETTINGS_PAGE);
    document.title = settings?.theme?.pageTitle || defaultTitle;
  } catch (err) {
    console.error("init layout config error:", err);
  }
}
