/** User-facing error reporting, ported from upstream tools/validator. */
import { message } from "@/tools/antdStatic";

/**
 * Show an error toast.
 * Security: only the message string is shown, never a stack trace (CWE-209).
 */
export function reportErrorMsg(err: unknown): void {
  const text = err instanceof Error ? err.message : String(err ?? "Unknown error");
  message.error(text);
}

/**
 * Account password rule shared with the panel (upstream PASSWORD_REGEX): 9-36
 * ASCII characters with a lower-case letter, an upper-case letter and a digit.
 * The panel checks it again server-side; this only gives early feedback.
 */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[\x00-\x7F]{9,36}$/;

/**
 * OS account names a user may be linked to, the same rule as the panel and
 * daemon (panel/src/app/service/os_account_service.ts): a POSIX login name or
 * a Windows "name" or "COMPUTER\\name". Numeric ids are refused, so an id can never be
 * mistaken for a name (CWE-20). Checked again server-side; this only gives
 * early feedback.
 */
export const OS_ACCOUNT_POSIX_REGEX = /^[A-Za-z_][A-Za-z0-9_-]{0,31}$/;
export const OS_ACCOUNT_WINDOWS_REGEX = /^(?:[A-Za-z0-9][A-Za-z0-9.-]{0,14}\\)?[A-Za-z0-9_](?:[A-Za-z0-9 ._-]{0,18}[A-Za-z0-9_-])?$/;

/** True for "" (no link) or a valid POSIX or Windows account name. */
export function isValidOsAccountName(value: string): boolean {
  if (value === "") return true;
  if (/^\d+$/.test(value)) return false;
  return OS_ACCOUNT_POSIX_REGEX.test(value) || OS_ACCOUNT_WINDOWS_REGEX.test(value);
}

/** antd Form validation errors carry `errorFields`; show the first message (upstream getValidatorErrorMsg). */
export function getValidatorErrorMsg(error: unknown, def = ""): string {
  const e = error as { message?: string; errorFields?: { errors?: string[] }[] } | null | undefined;
  if (e?.message) return e.message;
  if (Array.isArray(e?.errorFields)) return String(e.errorFields[0]?.errors?.[0] || "");
  if (e === null || e === undefined) return def;
  return String(e);
}

/** True for private, loopback, link-local and reserved addresses (copied from upstream tools/validator.ts). */
export function isLocalNetworkIP(ip: string): boolean {
  // Return false if empty string or invalid format
  if (!ip || typeof ip !== "string") {
    return false;
  }

  // Trim leading and trailing whitespace
  ip = ip.trim();

  // IPv4 address format check
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split(".").map(Number);

    // Check if valid IPv4 address (each part should be in 0-255 range)
    if (parts.some((part) => part < 0 || part > 255)) {
      return false;
    }

    const [first, second, third, fourth] = parts;

    // Private network address ranges
    // 10.0.0.0/8 (Class A)
    if (first === 10) {
      return true;
    }

    // 172.16.0.0/12 (Class B)
    if (first === 172 && second >= 16 && second <= 31) {
      return true;
    }

    // 192.168.0.0/16 (Class C)
    if (first === 192 && second === 168) {
      return true;
    }

    // Loopback address 127.0.0.0/8
    if (first === 127) {
      return true;
    }

    // Link-local address 169.254.0.0/16
    if (first === 169 && second === 254) {
      return true;
    }

    // Multicast address 224.0.0.0/4
    if (first >= 224 && first <= 239) {
      return true;
    }

    // Reserved addresses
    // 0.0.0.0/8 (current network)
    if (first === 0) {
      return true;
    }

    // 255.255.255.255 (broadcast address)
    if (first === 255 && second === 255 && third === 255 && fourth === 255) {
      return true;
    }
  }

  // IPv6 address check
  if (ip.includes(":")) {
    // Local loopback address
    if (ip === "::1") {
      return true;
    }

    // Link-local address fe80::/10
    if (
      ip.toLowerCase().startsWith("fe80:") ||
      ip.toLowerCase().startsWith("fe8") ||
      ip.toLowerCase().startsWith("fe9") ||
      ip.toLowerCase().startsWith("fea") ||
      ip.toLowerCase().startsWith("feb")
    ) {
      return true;
    }

    // Unique local address fc00::/7
    if (ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd")) {
      return true;
    }

    // Site-local address fec0::/10 (deprecated but still need to check)
    if (
      ip.toLowerCase().startsWith("fec") ||
      ip.toLowerCase().startsWith("fed") ||
      ip.toLowerCase().startsWith("fee") ||
      ip.toLowerCase().startsWith("fef")
    ) {
      return true;
    }

    // Multicast address ff00::/8
    if (ip.toLowerCase().startsWith("ff")) {
      return true;
    }

    // Unspecified address
    if (ip === "::" || ip === "0:0:0:0:0:0:0:0") {
      return true;
    }
  }

  return false;
}
