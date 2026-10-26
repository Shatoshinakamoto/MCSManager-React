/**
 * URL allow-lists for values that come from outside the panel (market JSON,
 * mod APIs) and end up in src/href attributes.
 *
 * SECURITY: only absolute http(s) URLs and same-origin root paths
 * ("/upload_files/x.png", which the market editor's image upload produces)
 * pass; javascript:, data:, blob:, protocol-relative "//host" and other
 * relative paths are dropped (CWE-79 via URL attributes, CWE-601).
 */
export const safeHttpUrl = (url?: unknown): string | undefined => {
  if (typeof url !== "string") return undefined;
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/") && !u.startsWith("//") && !u.startsWith("/\\")) return u;
  return undefined;
};

/**
 * Absolute http(s) URLs only, for pages embedded as plugin frames.
 *
 * SECURITY: a same-origin path is refused because it would load under the
 * panel's own origin and CSP, next to the logged-in session (CWE-829).
 */
export const safeAbsoluteHttpUrl = (url?: unknown): string | undefined =>
  typeof url === "string" && /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined;
