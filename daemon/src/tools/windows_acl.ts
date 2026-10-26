/**
 * Windows side of OS account bindings: look an account up by name and give
 * it (or take away) access to a folder with an inheritable ACL entry.
 *
 * Decided with the requester: on Windows a binding only grants folder
 * access. Instances keep running as the daemon's own account, because
 * starting a process as another account needs that account's password or
 * a service privilege the daemon does not have. See
 * docs/features/os-user-accounts.md.
 *
 * SECURITY:
 * - The account name never reaches a command line. The lookup is a fixed
 *   PowerShell script passed with -EncodedCommand; the name travels in the
 *   MCSM_OS_ACCOUNT environment variable (CWE-78, CWE-88).
 * - icacls receives the resolved SID ("*S-1-5-21-..."), never the name,
 *   through execFile (no shell).
 * - Only ordinary account SIDs are accepted: S-1-5-21-<domain>-<RID> with
 *   RID 1000 or above, and not a local group. This keeps out Everyone,
 *   SYSTEM, the built-in groups and the built-in Administrator (RID 500), so
 *   a binding can never hand a workspace to a whole group (CWE-732).
 * SECURITY-WARNING: domain groups cannot be told apart from domain users
 * without a directory query; they pass the SID shape check. Use
 * johnnykins.runAs.allowedUsers on Windows daemons joined to a domain.
 * TODO(security): reject domain groups through a directory lookup.
 * SECURITY-WARNING: this file is covered by unit tests with a mocked
 * process runner only; it has not been run on a real Windows host in this
 * project's CI.
 */
import { execFile } from "child_process";

/** Runs a program without a shell; replaceable in tests. */
export type Runner = (file: string, args: string[], env?: NodeJS.ProcessEnv) => Promise<{ stdout: string; stderr: string }>;

const defaultRunner: Runner = (file, args, env) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 20000, windowsHide: true, env: env ?? process.env, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${file} failed: ${String(stderr || err.message).trim().slice(0, 500)}`));
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });

let runner: Runner = defaultRunner;

/** Tests only: replace the process runner. */
export function setWindowsRunner(r?: Runner) {
  runner = r ?? defaultRunner;
}

/** Account names: optional DOMAIN\ prefix, 1-20 characters, no shell or path characters. */
export const WINDOWS_ACCOUNT_PATTERN = /^(?:[A-Za-z0-9][A-Za-z0-9.-]{0,14}\\)?[A-Za-z0-9_](?:[A-Za-z0-9 ._-]{0,18}[A-Za-z0-9_-])?$/;

/** Ordinary account SIDs (machine or domain accounts). */
const ACCOUNT_SID = /^S-1-5-21-\d{1,10}-\d{1,10}-\d{1,10}-(\d{1,10})$/;

const LOOKUP_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$n = $env:MCSM_OS_ACCOUNT",
  "$sid = (New-Object System.Security.Principal.NTAccount($n)).Translate([System.Security.Principal.SecurityIdentifier]).Value",
  "$group = $false",
  "try { $null = Get-LocalGroup -SID $sid -ErrorAction Stop; $group = $true } catch { }",
  "[Console]::Out.Write((@{ sid = $sid; group = $group } | ConvertTo-Json -Compress))"
].join("\n");

/** PowerShell's -EncodedCommand takes UTF-16LE in base64. */
export function encodePowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

/** Checks a SID returned by the lookup; returns it or throws. */
export function assertAccountSid(name: string, sid: string, isGroup: boolean): string {
  const m = ACCOUNT_SID.exec(String(sid));
  if (!m) throw new Error(`"${name}" is not an ordinary user account (SID ${sid}); built-in and well-known accounts cannot be linked.`);
  if (Number(m[1]) < 1000) throw new Error(`"${name}" is a built-in account (SID ${sid}) and cannot be linked.`);
  if (isGroup) throw new Error(`"${name}" is a group, not a user account.`);
  return sid;
}

/** Resolves a Windows account name to its SID. */
export async function lookupWindowsAccount(name: string): Promise<string> {
  if (!WINDOWS_ACCOUNT_PATTERN.test(name) || /^\d+$/.test(name)) throw new Error(`"${name}" is not a valid Windows account name.`);
  const { stdout } = await runner(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodePowerShell(LOOKUP_SCRIPT)],
    { ...process.env, MCSM_OS_ACCOUNT: name }
  ).catch((err: Error) => {
    throw new Error(`The Windows account "${name}" was not found on this host (${err.message}).`);
  });
  let parsed: { sid?: unknown; group?: unknown };
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    throw new Error(`Could not read the account lookup result for "${name}".`);
  }
  return assertAccountSid(name, String(parsed.sid ?? ""), parsed.group === true);
}

/** Inheritable grant on `dir` for `sid`: F = full control, RX = read and run. */
export async function grantFolder(dir: string, sid: string, access: "F" | "RX") {
  assertAccountSid("account", sid, false);
  await runner("icacls", [dir, "/grant:r", `*${sid}:(OI)(CI)${access}`, "/Q"]);
}

/** Removes every explicit grant for `sid` on `dir` (inherited entries are untouched). */
export async function revokeFolder(dir: string, sid: string) {
  assertAccountSid("account", sid, false);
  await runner("icacls", [dir, "/remove:g", `*${sid}`, "/Q"]);
}
