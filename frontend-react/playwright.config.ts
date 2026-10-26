/**
 * Playwright config for the end-to-end smoke tests in e2e/.
 *
 * The tests drive a real, running panel (built React UI in its public/
 * folder). Nothing is started here; CI starts the panel first
 * (.github/workflows/e2e.yml), locally run `npm run test:e2e` against your
 * dev panel.
 *
 * SECURITY: credentials come only from the MCSM_E2E_USER and
 * MCSM_E2E_PASSWORD environment variables and are never written to reports;
 * traces and screenshots are kept only for failures. Use a throwaway test
 * panel, never production.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.MCSM_E2E_URL ?? "http://localhost:23333",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 }
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }]
});
