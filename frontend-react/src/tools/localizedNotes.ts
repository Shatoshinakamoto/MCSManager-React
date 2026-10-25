// Pick a localized text from auto-update release notes (copied from upstream tools/localizedNotes.ts).
// Lookup order for a map: exact locale -> base language -> "en_us" -> "en".

export type UpgradeNotes = string | Record<string, string> | null | undefined;

const normalizeLang = (lang?: string) => (lang || "en_us").replace(/-/g, "_").toLowerCase();

export function pickLocalizedNotes(notes: UpgradeNotes, lang?: string): string | undefined {
  if (!notes) return undefined;
  if (typeof notes === "string") return notes;
  const table = new Map<string, string>();
  for (const [key, value] of Object.entries(notes)) {
    if (typeof value === "string" && value) table.set(normalizeLang(key), value);
  }
  const want = normalizeLang(lang);
  return table.get(want) ?? table.get(want.split("_")[0]) ?? table.get("en_us") ?? table.get("en");
}
