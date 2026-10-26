/**
 * Start command builder behind the command assistant (port of upstream
 * hooks/useGenerateStartCmd.ts, used by the Johnnykins fork's instance forms).
 *
 * Pure functions, so the dialog keeps the form state and tests can check the
 * output without rendering anything.
 *
 * Changes from upstream:
 * - The Minecraft "additional parameters" field is used as typed. Upstream
 *   always inserted the browser-language defaults and ignored edits to it.
 * - No trailing space when a program has no parameters.
 * - Language and region only come from a well-formed browser locale
 *   ("de-DE", not "zh-Hans-CN" read as region "Hans").
 *
 * SECURITY: the result is a start command the admin can read and edit before
 * saving; it is the same as typing it. Nothing here runs it.
 */
import { QUICKSTART_ACTION_TYPE } from "@/hooks/quickStartFlow";
import { TYPE_MINECRAFT_JAVA, TYPE_STEAM_SERVER_UNIVERSAL, TYPE_UNIVERSAL } from "@/hooks/useInstance";

export interface MinecraftJavaCmdForm {
  javaPath: string;
  jarName: string;
  maxMemory: string;
  minMemory: string;
  suffix: string;
  additional: string;
}

export interface AnyAppCmdForm {
  softwarePath: string;
  params: string;
}

/** JVM flags upstream adds by default: UTF-8 plus the browser's language and region. */
export function defaultJvmFlags(locale: string = typeof navigator === "undefined" ? "" : navigator.language): string {
  const flags = ["-Dfile.encoding=UTF-8"];
  const parts = String(locale || "").split("-");
  const language = parts[0];
  const country = parts.slice(1).find((p) => /^[A-Za-z]{2}$/.test(p));
  if (/^[A-Za-z]{2,3}$/.test(language ?? "")) flags.push(`-Duser.language=${language.toLowerCase()}`);
  if (country) flags.push(`-Duser.country=${country.toUpperCase()}`);
  return flags.join(" ");
}

export function newMinecraftJavaForm(locale?: string): MinecraftJavaCmdForm {
  return { javaPath: "", jarName: "", maxMemory: "", minMemory: "", suffix: "nogui", additional: defaultJvmFlags(locale) };
}

export function newAnyAppForm(): AnyAppCmdForm {
  return { softwarePath: "", params: "" };
}

/** The app type each assistant category opens with (upstream setGameType). */
export function defaultAppTypeFor(gameType: QUICKSTART_ACTION_TYPE): string {
  if (gameType === QUICKSTART_ACTION_TYPE.Minecraft) return TYPE_MINECRAFT_JAVA;
  if (gameType === QUICKSTART_ACTION_TYPE.SteamGameServer) return TYPE_STEAM_SERVER_UNIVERSAL;
  return TYPE_UNIVERSAL;
}

/** Quotes a path that contains spaces, as upstream does. */
const quoteIfSpaced = (v: string) => (v.includes(" ") ? `"${v}"` : v);

export function buildMinecraftJavaCmd(f: MinecraftJavaCmdForm): string {
  const java = f.javaPath.trim() ? `"${f.javaPath.trim()}"` : "java";
  const mem: string[] = [];
  if (f.minMemory.trim()) mem.push(`-Xms${f.minMemory.trim()}`);
  if (f.maxMemory.trim()) mem.push(`-Xmx${f.maxMemory.trim()}`);
  return [java, ...mem, f.additional.trim(), "-jar", quoteIfSpaced(f.jarName.trim()), f.suffix.trim()].filter(Boolean).join(" ");
}

export function buildAnyAppCmd(f: AnyAppCmdForm): string {
  return [quoteIfSpaced(f.softwarePath.trim()), f.params.trim()].filter(Boolean).join(" ");
}

/** Upstream buildCmd(): the Java form for Minecraft Java, the generic form for everything else. */
export function buildStartCmd(gameType: QUICKSTART_ACTION_TYPE | undefined, appType: string | undefined, mc: MinecraftJavaCmdForm, anyApp: AnyAppCmdForm): string {
  if (gameType === QUICKSTART_ACTION_TYPE.Minecraft && appType === TYPE_MINECRAFT_JAVA) return buildMinecraftJavaCmd(mc);
  return buildAnyAppCmd(anyApp);
}
