/**
 * Small validated localStorage state for the mod manager (replaces
 * @vueuse useLocalStorage). Values that fail `validate` fall back to the
 * default, so a tampered or stale entry cannot inject unexpected types (CWE-20).
 */
import { useCallback, useState } from "react";

export function readStored<T>(key: string, fallback: T, validate: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function useStoredState<T>(key: string, fallback: T, validate: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback, validate));
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(v));
        } catch {
          // Storage full or disabled: keep the in-memory value.
        }
        return v;
      });
    },
    [key]
  );
  return [value, set] as const;
}
