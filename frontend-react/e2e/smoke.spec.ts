/**
 * Logged-in smoke tests: login, every main page renders without page errors
 * or stuck loading cards, the token never appears in a URL, and the design
 * mode opens. Needs MCSM_E2E_USER / MCSM_E2E_PASSWORD for an admin account.
 */
import { expect, test } from "@playwright/test";
import { login, openPage, requireAccount, watch } from "./helpers";

test.describe("logged in", () => {
  requireAccount();

  test("a wrong password is refused", async ({ page }) => {
    await page.goto("/#/login");
    await page.locator("input[name=mcsm-name-input]").fill(process.env.MCSM_E2E_USER ?? "");
    await page.locator("input[name=mcsm-pw-input]").fill("definitely-not-the-password-1A!");
    await page.keyboard.press("Enter");
    await expect(page.locator(".ant-message-error, .ant-notification-notice-error, .ant-form-item-explain-error").first()).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/#\/login/);
  });

  test("main pages render and the token stays out of URLs", async ({ page }) => {
    const seen = watch(page);
    await login(page);
    for (const hash of ["#/instances", "#/overview", "#/node", "#/users", "#/market", "#/audit", "#/settings"]) {
      await openPage(page, hash);
      await expect(page.getByText("has not been ported to React yet")).toHaveCount(0);
    }
    expect(seen.pageErrors).toEqual([]);
    expect(seen.tokenUrls).toEqual([]);
  });

  test("design mode opens and closes without saving", async ({ page }) => {
    await login(page);
    await openPage(page, "#/overview");
    await page.locator(".anticon-build").first().click();
    await page.locator(".ant-modal-confirm .ant-btn-primary").click();
    await expect(page.locator(".anticon-save").first()).toBeVisible();
    await page.reload();
    await expect(page.locator(".anticon-build").first()).toBeVisible();
  });
});
