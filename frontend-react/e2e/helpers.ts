/**
 * Shared helpers for the e2e smoke tests: login with credentials from the
 * environment, and collectors for page errors and token leaks.
 *
 * SECURITY: the password is read from MCSM_E2E_PASSWORD and only typed into
 * the login form; it is never logged or attached to the report.
 */
import { expect, test, type Page } from "@playwright/test";

export const E2E_USER = process.env.MCSM_E2E_USER ?? "";
export const E2E_PASSWORD = process.env.MCSM_E2E_PASSWORD ?? "";

/** Skips the calling test file when no test account is configured. */
export function requireAccount(): void {
  test.skip(!E2E_USER || !E2E_PASSWORD, "Set MCSM_E2E_USER and MCSM_E2E_PASSWORD to run the logged-in tests.");
}

export async function login(page: Page): Promise<void> {
  await page.goto("/#/login");
  await page.locator("input[name=mcsm-name-input]").fill(E2E_USER);
  await page.locator("input[name=mcsm-pw-input]").fill(E2E_PASSWORD);
  await page.keyboard.press("Enter");
  // Wait for the landing page itself: "/" redirects on to /instances or
  // /customer a moment later, and navigating before that would be undone.
  await expect(page).toHaveURL(/#\/(?!login)[a-z]/, { timeout: 20_000 });
}

/** Records uncaught page errors and any request URL carrying a session token. */
export function watch(page: Page) {
  const pageErrors: string[] = [];
  const tokenUrls: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("request", (r) => {
    if (/[?&]token=/.test(r.url())) tokenUrls.push(new URL(r.url()).pathname);
  });
  return { pageErrors, tokenUrls };
}

/** Navigates within the SPA by hash and waits for lazy cards to finish loading. */
export async function openPage(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => (window.location.hash = h), hash);
  await expect(page).toHaveURL(new RegExp(hash.replace(/[?]/g, "\\?")));
  await expect(page.locator(".ant-skeleton")).toHaveCount(0, { timeout: 20_000 });
}
