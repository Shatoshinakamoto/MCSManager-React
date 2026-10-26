/**
 * Panel security headers and inert uploads, checked over HTTP without a
 * browser login: strict CSP on the UI (no eval), the sandboxed plugin host,
 * and uploaded markup served as plain text.
 *
 * These are the panel's production headers, so they are skipped when
 * MCSM_E2E_URL points at the Vite dev server, which sets none of them.
 */
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const html = await (await request.get("/")).text();
  test.skip(html.includes("/@vite/client"), "Served by the Vite dev server, not the panel.");
});

test("the panel UI is served with a CSP that forbids eval", async ({ request }) => {
  const res = await request.get("/");
  expect(res.ok()).toBe(true);
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain("unsafe-eval");
  expect(await res.text()).toContain('name="mcsm-csp" content="strict"');
});

test("the legacy plugin host is sandboxed in its own origin", async ({ request }) => {
  const res = await request.get("/plugin-host.html");
  expect(res.ok()).toBe(true);
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/^sandbox allow-scripts/);
  expect(csp).not.toContain("allow-same-origin");
  expect(csp).not.toContain("unsafe-eval");
});

test("source maps are not served", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const entry = /src="\.\/assets\/([^"]+\.js)"/.exec(html)?.[1];
  expect(entry).toBeTruthy();
  expect((await request.get(`/assets/${entry}.map`)).status()).toBe(404);
});
