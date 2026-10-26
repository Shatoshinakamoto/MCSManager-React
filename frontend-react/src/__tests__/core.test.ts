/**
 * Unit tests for the framework-independent pieces of the port, including
 * security tests with malicious inputs (CWE-79, CWE-20, auth guard).
 */
import { describe, expect, it } from "vitest";
import { computeCardLayout, PLACE_HOLDER_CARD } from "@/hooks/cardLayout";
import { resolveNavigation } from "@/config/routes";
import { parseLayoutConfig } from "@/stores/layoutConfig";
import { safeCssUrl } from "@/stores/appConfig";
import { markdownToHTML } from "@/tools/safe";
import { ROLE, type LayoutCard, type LoginUserInfo } from "@/types";

const card = (id: string, width: number): LayoutCard => ({ id, type: "TitleCard", title: id, width, height: "200px", meta: {} });
const user = (permission: number) => ({ permission, token: "t" }) as LoginUserInfo;

describe("computeCardLayout (parity with upstream useCardLayoutComputed)", () => {
  it("pads a short last row", () => {
    const out = computeCardLayout([card("a", 6), card("b", 3)]);
    expect(out.map((c) => [c.type === PLACE_HOLDER_CARD ? "P" : c.id, c.width])).toEqual([["a", 6], ["b", 3], ["P", 3]]);
  });
  it("wraps a card that overflows the row", () => {
    const out = computeCardLayout([card("a", 8), card("b", 6)]);
    expect(out.map((c) => [c.type === PLACE_HOLDER_CARD ? "P" : c.id, c.width])).toEqual([["a", 8], ["P", 4], ["b", 6], ["P", 6]]);
  });
  it("leaves full rows alone", () => {
    expect(computeCardLayout([card("a", 12), card("b", 6), card("c", 6)])).toHaveLength(3);
  });
});

describe("resolveNavigation (route guard)", () => {
  const base = { isInstall: true, user: null, isDesignMode: false };
  it("forces /install before setup", () => expect(resolveNavigation("/instances", { ...base, isInstall: false })).toBe("/install"));
  it("sends guests to /login", () => expect(resolveNavigation("/instances", base)).toBe("/login"));
  it("keeps normal users off admin pages", () => expect(resolveNavigation("/settings", { ...base, user: user(ROLE.USER) })).toBe("/customer"));
  it("lets admins in", () => expect(resolveNavigation("/settings", { ...base, user: user(ROLE.ADMIN) })).toBeNull());
  it("redirects root by role", () => {
    expect(resolveNavigation("/", { ...base, user: user(ROLE.ADMIN) })).toBe("/instances");
    expect(resolveNavigation("/", { ...base, user: user(ROLE.USER) })).toBe("/customer");
  });
  it("404s unknown paths", () => expect(resolveNavigation("/nope", { ...base, user: user(ROLE.ADMIN) })).toBe("/404"));
  it("treats Web Admins as admins", () => expect(resolveNavigation("/", { ...base, user: user(ROLE.WEBADMIN) })).toBe("/instances"));
  it("keeps plain admins off Web Admin pages once enforced", () => {
    expect(resolveNavigation("/settings", { ...base, user: user(ROLE.ADMIN), webAdminEnforced: true })).toBe("/404");
    expect(resolveNavigation("/node/image", { ...base, user: user(ROLE.ADMIN), webAdminEnforced: true })).toBe("/404");
    expect(resolveNavigation("/instances", { ...base, user: user(ROLE.ADMIN), webAdminEnforced: true })).toBeNull();
    expect(resolveNavigation("/settings", { ...base, user: user(ROLE.WEBADMIN), webAdminEnforced: true })).toBeNull();
    expect(resolveNavigation("/settings", { ...base, user: user(ROLE.ADMIN), webAdminEnforced: false })).toBeNull();
  });
  it("keeps banned users out", () => expect(resolveNavigation("/instances", { ...base, user: user(ROLE.BAN) })).toBe("/customer"));
});

describe("parseLayoutConfig (CWE-20)", () => {
  it("drops malformed pages and cards", () => {
    const parsed = parseLayoutConfig(JSON.stringify([{ page: "/x", items: [card("a", 6), { id: 1 }, null] }, { nope: true }, "str"]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].items.map((c) => c.id)).toEqual(["a"]);
  });
  it("returns [] for non-arrays", () => expect(parseLayoutConfig("{}")).toEqual([]));
});

describe("markdownToHTML (CWE-79)", () => {
  it("strips scripts and event handlers", () => {
    const html = markdownToHTML('<script>alert(1)</script><img src="x.png" onerror="alert(1)">');
    expect(html).not.toMatch(/script|onerror/i);
  });
  it("removes javascript: links and adds rel to links", () => {
    expect(markdownToHTML("[x](javascript:alert(1))")).not.toMatch(/javascript:/i);
    expect(markdownToHTML("[x](https://example.com)")).toContain('rel="noopener noreferrer"');
  });
});

describe("safeCssUrl (CSS injection)", () => {
  it("rejects non-http schemes", () => {
    expect(safeCssUrl("javascript:alert(1)")).toBeNull();
    expect(safeCssUrl("data:image/svg+xml,<svg>")).toBeNull();
  });
  it("escapes quotes that would break out of url()", () => {
    expect(safeCssUrl('https://a/b");background:red;("')).not.toMatch(/[^\\]"\)/);
  });
});
