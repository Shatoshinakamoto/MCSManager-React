/**
 * Safe Markdown rendering for admin-authored text (login page info, TextCard).
 *
 * Trust boundary: the Markdown comes from panel settings, which any admin can
 * edit and which other users then view, so it is treated as untrusted HTML.
 *
 * Security (CWE-79, ASVS V5.3.3): Markdown is parsed with `marked`, then the
 * HTML is passed through DOMPurify with a tag/attribute allow-list matching
 * upstream's sanitize-html config. Links are forced to rel="noopener
 * noreferrer" and only http(s)/mailto URLs survive (CWE-601 tab-nabbing,
 * javascript: URLs). DOMPurify replaces upstream's sanitize-html because it is
 * DOM-based and smaller in the browser bundle.
 */
import DOMPurify from "dompurify";
import { marked } from "marked";

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6", "b", "i", "em", "strong", "a", "p",
  "table", "ul", "ol", "li", "img", "pre", "blockquote", "tbody", "tr", "th",
  "td", "hr", "br", "code", "font"
];
const ALLOWED_ATTR = ["href", "target", "height", "width", "src", "alt"];
// SECURITY: only these URL schemes may appear in href/src (blocks javascript:, data:).
const SAFE_URL = /^(?:https?:|mailto:|\/|\.\/|#)/i;

let hooked = false;
function installHooks(): void {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    for (const attr of ["href", "src"]) {
      const value = node.getAttribute(attr);
      // SECURITY: drop any URL whose scheme is not allow-listed (CWE-79).
      if (value !== null && !SAFE_URL.test(value.trim())) node.removeAttribute(attr);
    }
    if (node.tagName === "A") {
      // SECURITY: prevent reverse tab-nabbing on target=_blank links.
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

/**
 * Convert Markdown to sanitized HTML that is safe for dangerouslySetInnerHTML.
 * @param markdown untrusted Markdown text
 * @returns sanitized HTML string
 */
export function markdownToHTML(markdown: string): string {
  installHooks();
  const html = marked.parse(markdown ?? "", { async: false }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
