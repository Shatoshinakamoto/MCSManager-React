/** Object helpers (port of upstream tools/object.ts). */

/**
 * Walk an object (max depth 5, cycle-safe) and delete keys whose value the
 * filter rejects. Mutates and returns `obj`.
 */
export function deepTraverseObject<T = unknown>(obj: unknown, filter: (key: string, value: T) => boolean, visited = new WeakSet<object>(), deep = 0) {
  if (deep > 5) return obj;
  if (obj && typeof obj === "object") {
    if (visited.has(obj)) return obj;
    visited.add(obj);
  }
  const rec = obj as Record<string, unknown>;
  for (const key in rec) {
    if (!filter(key, rec[key] as T)) {
      delete rec[key];
      continue;
    }
    if (rec[key] && typeof rec[key] === "object") deepTraverseObject(rec[key], filter, visited, deep + 1);
  }
  return obj;
}

/** Drop null, undefined and empty-string fields (deeply) from a copy-free object. */
export function filterEmptyFields<T>(obj: T): T {
  return deepTraverseObject(obj, (_, value) => value !== null && value !== undefined && value !== "") as T;
}
