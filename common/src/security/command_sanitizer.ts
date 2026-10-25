/**
 * Johnnykins command sanitizer: filters console commands the panel sends to an
 * instance (daemon "instance/command" and "stream/input").
 *
 * Ported from the Johnnykins-MCSManager fork (sanitize.ts, java_sanitize.ts,
 * universal_sanitize.ts by Johnathan Edward Brown) and its config keys
 * (sanitizer, mcSanitizer, sanitizerBuiltInBlacklist,
 * sanitizerConfigurableBlacklist, sanitizerBlacklist).
 *
 * What changed from the fork, and why:
 * - The fork removed blacklist entries as substrings with `new RegExp(entry, "gi")`.
 *   That mangled ordinary commands ("say ship it" lost "ip", "/give" lost
 *   "go"), which is why the sanitizer had to be switched off. Entries are now
 *   matched as whole command words (or literal prefixes for entries that
 *   contain a space or "/"), and a match REJECTS the command instead of
 *   silently rewriting it.
 * - Config entries are compared literally and never compiled into a regex,
 *   so a bad entry cannot throw or cause ReDoS (CWE-1333, CWE-185).
 * - Quoted strings and backslash escapes are kept by default, because
 *   Minecraft JSON commands (/tellraw, /title) need them. The fork's removal
 *   is still available as `stripEscapes`.
 * - The built-in shell blacklist applies only to instances whose start
 *   command launches a shell (bash, sh, cmd, PowerShell...). For other
 *   programs words like "echo" or "stop" are just program input, and
 *   blocking them broke ordinary consoles.
 * - Emoji detection uses the Unicode Extended_Pictographic property instead
 *   of a hand-written range list.
 *
 * SECURITY-WARNING: a blocklist is defense in depth, not a security boundary.
 * A shell can spell a blocked command many other ways (quotes, variables,
 * base64). The real controls are the daemon-side `canSendCommands` gate,
 * running instances as an unprivileged user or in Docker, and SELinux in
 * enforcing mode. (OWASP Input Validation: prefer allow-lists.)
 */

export type SanitizerProfile = "minecraft" | "universal" | "shell";

export interface SanitizerOptions {
  /** Master switch for non-Minecraft instances (fork: `sanitizer`). */
  sanitizer: boolean;
  /** Use the Minecraft profile for minecraft/* instances (fork: `mcSanitizer`). */
  mcSanitizer: boolean;
  /** Drop C0/C1 control characters and ANSI escape sequences. */
  stripControlChars: boolean;
  /** Drop emoji (Extended_Pictographic) and zero-width joiners. */
  stripEmoji: boolean;
  /** Fork behaviour: drop backslash escapes and quoted literals. Breaks JSON commands. */
  stripEscapes: boolean;
  /** Reject shell commands from the built-in list (instances whose start command is a shell). */
  sanitizerBuiltInBlacklist: boolean;
  /** Reject commands from `sanitizerBlacklist` (both profiles). */
  sanitizerConfigurableBlacklist: boolean;
  sanitizerBlacklist: string[];
  /** Commands longer than this are rejected (CWE-400). */
  maxLength: number;
}

export const DEFAULT_SANITIZER_OPTIONS: SanitizerOptions = {
  sanitizer: true,
  mcSanitizer: true,
  stripControlChars: true,
  stripEmoji: true,
  stripEscapes: false,
  sanitizerBuiltInBlacklist: true,
  sanitizerConfigurableBlacklist: false,
  sanitizerBlacklist: [],
  maxLength: 32767
};

/**
 * Command words from the fork's built-in list, de-duplicated. The fork's
 * "rm -rf /" style variants all reduce to the command word "rm". "help" was
 * dropped (harmless, and a common game-server command). Additions over the
 * fork are marked.
 */
export const BUILT_IN_BLACKLIST: readonly string[] = [
  "rm", "mv", "dd", "mkfs", "cd", "chmod", "chown", "symlink", "chroot",
  "apt", "apt-get", "apt-cache", "apt-key", "apt-mark", "aptitude", "apt-add-repository", "apt-ftparchive", "snap",
  "gawk", "awk", "sudo", "su" /* added */,
  "netstat", "ping", "ip", "iptables", "ufw", "wget", "curl" /* added */, "nc" /* added */,
  "node", "python", "go", "sh", "bash", "zsh" /* added */,
  "shutdown", "init", "poweroff", "reboot", "halt", "systemctl", "crontab", "cron",
  "timeshift", "gparted", "mount", "umount", "unmount", "cryptsetup", "cryptdisks_start", "cryptdisks_stop",
  "tee", "echo"
];

/** Literal fragments rejected anywhere in a universal-profile command. */
const BUILT_IN_FRAGMENTS: readonly string[] = ["../", "$SHELL"];

export interface SanitizeResult {
  ok: boolean;
  /** The cleaned command (only meaningful when ok). */
  command: string;
  /** Why it was rejected. Safe to show to the user; never contains secrets. */
  reason?: "too_long" | "blocked_command" | "blocked_fragment";
  /** The blacklist entry that matched. */
  matched?: string;
}

// ANSI CSI/OSC escape sequences, then remaining C0/C1 controls (CWE-150).
const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}‍️]/gu;
// Shell control operators that start a new command.
const SEGMENT_SPLIT = /;|&&|\|\||\||&|\n|`|\$\(/;

/** First word of each shell segment, lower-cased, path stripped ("/bin/rm" -> "rm"). */
export function commandWords(command: string): string[] {
  return command
    .split(SEGMENT_SPLIT)
    .map((seg) => (seg.trim().replace(/^\(+/, "").split(/\s+/)[0] ?? "").replace(/\)+$/, ""))
    .map((w) => w.replace(/^\/+/, ""))
    .map((w) => w.slice(w.lastIndexOf("/") + 1).toLowerCase())
    .filter((w) => w.length > 0);
}

function matchEntry(command: string, words: string[], entry: string): boolean {
  const e = entry.trim().toLowerCase();
  if (!e) return false;
  // Entries with a space or slash ("tee /", "rm -rf /") are literal fragments.
  if (/[\s/]/.test(e)) return command.toLowerCase().includes(e);
  return words.includes(e);
}

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ash", "ksh", "fish", "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe"]);

/** True when a start command launches an interactive shell. */
export function isShellStartCommand(startCommand: string | undefined): boolean {
  const first = String(startCommand ?? "").trim().replace(/^["']/, "").split(/["'\s]/)[0] ?? "";
  const base = first.slice(Math.max(first.lastIndexOf("/"), first.lastIndexOf("\\")) + 1).toLowerCase();
  return SHELLS.has(base);
}

/**
 * Pick the profile for an instance.
 * @param instanceType e.g. "minecraft/java", "universal"
 * @param startCommand the instance start command, used to detect shells
 */
export function profileFor(instanceType: string | undefined, opts: SanitizerOptions, startCommand?: string): SanitizerProfile | null {
  const isMc = typeof instanceType === "string" && instanceType.startsWith("minecraft");
  if (isMc) return opts.mcSanitizer ? "minecraft" : null;
  if (!opts.sanitizer) return null;
  return isShellStartCommand(startCommand) ? "shell" : "universal";
}

/**
 * Sanitize one console command.
 * @param profile from profileFor(); null means sanitizing is switched off.
 */
export function sanitizeCommand(input: string, profile: SanitizerProfile | null, opts: SanitizerOptions): SanitizeResult {
  let command = String(input ?? "");
  if (command.length > opts.maxLength) return { ok: false, command: "", reason: "too_long" };
  if (profile === null) return { ok: true, command };

  if (opts.stripControlChars) command = command.replace(ANSI, "").replace(CONTROL, "");
  if (opts.stripEmoji) command = command.replace(EMOJI, "");
  if (opts.stripEscapes) {
    command = command.replace(/\\./g, "").replace(/(["'])(?:\\.|(?!\1).)*\1/g, "").replace(/`(?:\\.|[^\\`])*`/g, "");
  }

  const words = commandWords(command);
  if (profile === "shell" && opts.sanitizerBuiltInBlacklist) {
    for (const f of BUILT_IN_FRAGMENTS) if (command.includes(f)) return { ok: false, command: "", reason: "blocked_fragment", matched: f };
    for (const e of BUILT_IN_BLACKLIST) if (matchEntry(command, words, e)) return { ok: false, command: "", reason: "blocked_command", matched: e };
  }
  if (opts.sanitizerConfigurableBlacklist && Array.isArray(opts.sanitizerBlacklist)) {
    for (const e of opts.sanitizerBlacklist) {
      if (typeof e === "string" && matchEntry(command, words, e)) return { ok: false, command: "", reason: "blocked_command", matched: e };
    }
  }
  return { ok: true, command };
}

/** Merge a possibly partial or malformed config object over the defaults (CWE-20). */
export function normalizeSanitizerOptions(v: unknown): SanitizerOptions {
  const o = (v && typeof v === "object" ? v : {}) as Partial<SanitizerOptions>;
  const d = DEFAULT_SANITIZER_OPTIONS;
  const bool = (x: unknown, def: boolean) => (typeof x === "boolean" ? x : def);
  return {
    sanitizer: bool(o.sanitizer, d.sanitizer),
    mcSanitizer: bool(o.mcSanitizer, d.mcSanitizer),
    stripControlChars: bool(o.stripControlChars, d.stripControlChars),
    stripEmoji: bool(o.stripEmoji, d.stripEmoji),
    stripEscapes: bool(o.stripEscapes, d.stripEscapes),
    sanitizerBuiltInBlacklist: bool(o.sanitizerBuiltInBlacklist, d.sanitizerBuiltInBlacklist),
    sanitizerConfigurableBlacklist: bool(o.sanitizerConfigurableBlacklist, d.sanitizerConfigurableBlacklist),
    sanitizerBlacklist: Array.isArray(o.sanitizerBlacklist)
      ? o.sanitizerBlacklist.filter((e): e is string => typeof e === "string" && e.trim().length > 0 && e.length <= 256).slice(0, 1000)
      : [],
    maxLength: Number.isSafeInteger(o.maxLength) && (o.maxLength as number) > 0 ? Math.min(o.maxLength as number, 1_000_000) : d.maxLength
  };
}
