/** Array helpers (copied from upstream tools/array.ts). */

export interface ConditionFilterItem {
  condition?: (index?: number) => boolean;
}

/** Keep items whose optional `condition()` returns true. */
export function arrayFilter<T>(arr: (T & ConditionFilterItem)[]): T[] {
  return arr.filter((item, index) => (typeof item.condition === "function" ? item.condition(index) : true));
}

export function arrayUnique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
