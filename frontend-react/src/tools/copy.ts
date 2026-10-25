/**
 * Clipboard helper (port of tools/copy.ts). Panels are often served over
 * plain http, where navigator.clipboard is unavailable, so it falls back to
 * a temporary input + execCommand like upstream.
 */
import { message } from "antd";
import { t } from "@/lang/i18n";

export async function toCopy(value: string | number): Promise<void> {
  const text = String(value);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const input = document.createElement("input");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    message.success(t("TXT_CODE_b858d78a"));
  } catch {
    message.error(t("TXT_CODE_ca07c84c"));
  }
}
