/** User-facing error reporting, ported from upstream tools/validator. */
import { message } from "antd";

/**
 * Show an error toast.
 * Security: only the message string is shown, never a stack trace (CWE-209).
 */
export function reportErrorMsg(err: unknown): void {
  const text = err instanceof Error ? err.message : String(err ?? "Unknown error");
  message.error(text);
}
