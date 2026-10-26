/**
 * Shapes of the mod manager data the daemon returns (upstream typed these as
 * `any`). Everything here is daemon or third-party (Modrinth, CurseForge,
 * SpigotMC) output and is rendered as text only.
 */
export interface ModExtraInfo {
  project?: { id?: string; name?: string; slug?: string; description?: string; icon_url?: string };
  version?: { id?: string; name?: string; version_number?: string };
  source?: string;
}

export interface LocalMod {
  file: string;
  name?: string;
  version?: string;
  enabled: boolean;
  hash?: string;
  type?: string;
  folder?: string;
  id?: string;
  extraInfo?: ModExtraInfo;
}

export interface TransferTask {
  id?: string;
  path: string;
  type: "download" | "upload";
  status: number;
  current: number;
  total: number;
  error?: string;
}

export interface ModListStatus {
  mods?: LocalMod[];
  folders?: string[];
  total?: number;
  downloadTasks?: TransferTask[];
  downloadFileFromURLTask?: number;
}

export interface SearchHit {
  id: string;
  project_id?: string;
  slug?: string;
  title?: string;
  name?: string;
  description?: string;
  icon_url?: string;
  thumbnail?: string;
  version_number?: string;
  updated?: string;
  project_type?: string;
  source?: string;
}

export interface ModVersionFile {
  url: string;
  filename?: string;
  name?: string;
  primary?: boolean;
}

export interface ModVersion {
  id: string;
  name?: string;
  version_number?: string;
  game_versions?: string[];
  loaders?: string[];
  files: ModVersionFile[];
  project_type?: string;
  date_published?: string;
  published_at?: string;
  updated?: string;
  filename?: string;
  fileName?: string;
}

export interface SearchFilters {
  query: string;
  source: string;
  version: string;
  type: string;
  loader: string;
  environment: string;
}

/** Only http(s) image URLs from third-party APIs are shown (no data:, javascript:, etc.). */
export const safeImageUrl = (url?: string) => (url && /^https?:\/\//i.test(url) ? url : undefined);
