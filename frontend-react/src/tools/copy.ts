/**
 * Clipboard helper (port of tools/copy.ts). Panels are often served over
 * plain http, where navigator.clipboard is unavailable, so it falls back to
 * a temporary input + execCommand like upstream. When both fail, a dialog
 * shows the text for manual copying (upstream behaviour).
 *
 * SECURITY: the text is rendered as a React text node, never as HTML (CWE-79).
 */
import { createElement } from "react";
import { message, modal } from "@/tools/antdStatic";
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
      const ok = document.execCommand("copy");
      document.body.removeChild(input);
      if (!ok) throw new Error("execCommand copy refused");
    }
    message.success(t("TXT_CODE_b858d78a"));
  } catch {
    modal.warning({
      title: t("TXT_CODE_ca07c84c"),
      content: createElement("div", null, t("TXT_CODE_2452016e"), createElement("br"), createElement("span", { style: { userSelect: "all", wordBreak: "break-all" } }, text))
    });
  }
}
