/** Instance tag editing, tag tips and tag search (port of upstream hooks/useInstanceTag.ts). */
import { useCallback, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { updateInstanceConfig } from "@/services/apis/instance";
import { arrayUnique } from "@/tools/array";

const sortTags = (tags: string[]) => [...tags].sort((a, b) => (a > b ? 1 : -1));

/** Edit one instance's tags locally, then save them with saveTags(). */
export function useInstanceTags(instanceId: string, daemonId: string, tags: string[], tagsTips?: string[]) {
  const [instanceTags, setInstanceTags] = useState<string[]>(() => [...tags]);
  const [saveLoading, setSaveLoading] = useState(false);

  const instanceTagsTips = useMemo(() => {
    if (!tagsTips) return [];
    return sortTags(arrayUnique(tagsTips.filter((tag) => !instanceTags.includes(tag))).slice(0, 30));
  }, [tagsTips, instanceTags]);

  const removeTag = (tag: string) => setInstanceTags((prev) => prev.filter((v) => v !== tag.trim()));

  const addTag = (tag: string) => {
    const v = tag.trim();
    setInstanceTags((prev) => (prev.includes(v) ? prev : sortTags([...prev, v])));
  };

  const saveTags = async () => {
    setSaveLoading(true);
    try {
      return await updateInstanceConfig({ params: { uuid: instanceId, daemonId }, data: { tag: instanceTags } });
    } finally {
      setSaveLoading(false);
    }
  };

  return { removeTag, addTag, saveTags, instanceTags, instanceTagsTips, saveLoading };
}

/** All tags seen in the last instance list response, shared app-wide (upstream createGlobalState). */
export const useInstanceTagTips = create<{ tagTips: string[]; updateTagTips: (allTags: string[]) => void }>((set) => ({
  tagTips: [],
  updateTagTips: (tagTips) => set({ tagTips })
}));

/**
 * Selected tag filter for the instance list. The refresh function receives
 * the new tag list, because React state is not updated until the next render.
 */
export function useInstanceTagSearch() {
  const [tags, setTags] = useState<string[]>([]);
  const searchFn = useRef<(tags: string[]) => void>(() => undefined);

  const update = useCallback((next: string[]) => {
    setTags(next);
    searchFn.current(next);
  }, []);

  return {
    tags,
    selectTag: (tag: string) => update([...tags, tag]),
    removeTag: (tag: string) => update(tags.filter((v) => v !== tag)),
    clearTags: () => update([]),
    /** Clear without triggering a search (used when switching daemons). */
    resetTags: () => setTags([]),
    setRefreshFn: (fn: (tags: string[]) => void) => {
      searchFn.current = fn;
    },
    isTagSelected: (tag: string) => tags.includes(tag)
  };
}
