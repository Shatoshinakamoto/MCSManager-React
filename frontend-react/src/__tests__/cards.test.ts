/**
 * Security tests for the Phase 4 decorative cards: the URL allow-lists that
 * guard image, carousel, link and plugin cards (CWE-79 via URL attributes,
 * CWE-601, CWE-829) and the sandbox flags of the embedded frames (CWE-1021).
 */
import { describe, expect, it } from "vitest";
import { safeAbsoluteHttpUrl, safeHttpUrl } from "@/tools/safeUrl";
import { IFRAME_SANDBOX } from "@/widgets/others/IframeCard";
import { PLUGIN_SANDBOX } from "@/widgets/others/PluginCard";

const hostile = ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "blob:http://x/1", "//evil.example/x", "/\\evil.example", "vbscript:x", "", 42, null, undefined];

describe("safeHttpUrl (image, carousel and link cards)", () => {
  it("keeps http(s) and same-origin root paths", () => {
    expect(safeHttpUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(safeHttpUrl(" http://example.com ")).toBe("http://example.com");
    expect(safeHttpUrl("/upload_files/a.png")).toBe("/upload_files/a.png");
  });
  it.each(hostile)("drops %s", (u) => expect(safeHttpUrl(u)).toBeUndefined());
});

describe("safeAbsoluteHttpUrl (plugin card)", () => {
  it("keeps absolute http(s) only", () => {
    expect(safeAbsoluteHttpUrl("https://plugins.example/p.html")).toBe("https://plugins.example/p.html");
    expect(safeAbsoluteHttpUrl("/upload_files/p.html")).toBeUndefined();
  });
  it.each(hostile)("drops %s", (u) => expect(safeAbsoluteHttpUrl(u)).toBeUndefined());
});

describe("frame sandboxes", () => {
  it("never let a card frame navigate the panel", () => {
    for (const s of [IFRAME_SANDBOX, PLUGIN_SANDBOX]) expect(s).not.toMatch(/allow-top-navigation/);
  });
  it("keep plugin frames off the panel origin", () => {
    expect(PLUGIN_SANDBOX).not.toContain("allow-same-origin");
  });
});
