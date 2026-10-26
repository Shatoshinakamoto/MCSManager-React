/**
 * Renders the small amount of markup found in translation strings (line
 * breaks, bold, code, links, HTML entities) without dangerouslySetInnerHTML.
 *
 * SECURITY: upstream used v-html for these strings. Here the string is parsed
 * with DOMParser (which never runs scripts) and rebuilt as React elements from
 * an allowlist of tags; every attribute is dropped except an https/http href
 * on <a>, which always opens with rel="noopener noreferrer". Anything else is
 * rendered as plain text (CWE-79 defence in depth, OWASP XSS guidance).
 */
import { createElement, Fragment, type ReactNode } from "react";

const ALLOWED_TAGS = new Set(["br", "b", "strong", "i", "em", "code", "span", "p", "ul", "ol", "li", "a"]);

function convert(node: ChildNode, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(convert);
  if (!ALLOWED_TAGS.has(tag)) return createElement(Fragment, { key }, ...children);
  if (tag === "br") return createElement("br", { key });
  if (tag === "a") {
    const href = el.getAttribute("href") ?? "";
    if (!/^https?:\/\//i.test(href)) return createElement(Fragment, { key }, ...children);
    return createElement("a", { key, href, target: "_blank", rel: "noopener noreferrer" }, ...children);
  }
  return createElement(tag, { key }, ...children);
}

export default function SafeHtml({ html }: { html: string }) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return <>{Array.from(doc.body.childNodes).map(convert)}</>;
}
