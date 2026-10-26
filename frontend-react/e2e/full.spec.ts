/**
 * End-to-end run of a real scenario against a live panel and daemon:
 * create an instance, open every route of the React UI (including the
 * instance pages), run the instance, send a console command through the UI
 * and read it back, use the file manager, open the instance settings, then
 * delete the instance. Fails on uncaught page errors, unexpected console
 * errors, 5xx answers, "not ported" placeholders and cards stuck loading.
 *
 * Needs MCSM_E2E_USER / MCSM_E2E_PASSWORD for a Web Admin or Admin account and
 * a connected Linux or macOS daemon. Everything it creates is named
 * "e2e-<time>" and removed at the end.
 */
import { expect, test, type Page } from "@playwright/test";
import { login, openPage, requireAccount } from "./helpers";

/** Errors that are expected on a default install and are not regressions. */
const KNOWN_ERRORS = [
  /\/api\/auth\/sso\/config/, // 500 while SSO is not configured (upstream behaviour)
  /\/api\/protected_instance\/outputlog/, // 500 before an instance has ever run (upstream behaviour)
  /Insufficient Permissions/, // user info probe on the login page before logging in
  /status of 403/ // same probe, as a resource error
];

function collectProblems(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = `${m.text()} ${m.location().url ?? ""}`;
    if (!KNOWN_ERRORS.some((r) => r.test(text))) problems.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500 && !KNOWN_ERRORS.some((re) => re.test(r.url()))) problems.push(`HTTP ${r.status()}: ${new URL(r.url()).pathname}`);
  });
  return problems;
}

/** Calls the panel API from the logged-in page, the same way the UI does. */
async function api<T = any>(page: Page, method: string, url: string, body?: unknown): Promise<{ status: number; data: T }> {
  return page.evaluate(
    async ({ method, url, body }) => {
      const xrw = { "X-Requested-With": "XMLHttpRequest" };
      const me = await (await fetch("/api/auth/", { headers: xrw })).json();
      const res = await fetch(url, {
        method,
        headers: { ...xrw, "Content-Type": "application/json", "X-MCSM-Token": me?.data?.token ?? "" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, data: json?.data };
    },
    { method, url, body }
  );
}

test.describe("real scenario", () => {
  requireAccount();
  test.setTimeout(240_000);

  test("instance lifecycle and every page", async ({ page }) => {
    const problems = collectProblems(page);
    await login(page);

    const overview = await api(page, "GET", "/api/overview");
    const daemon = (overview.data?.remote ?? []).find((r: any) => r.available);
    test.skip(!daemon, "No connected daemon.");
    test.skip(daemon.system?.platform === "win32", "This scenario uses a POSIX shell command.");
    const daemonId: string = daemon.uuid;
    // Without a reachable Docker engine on the daemon host, the Docker pages answer 500 (upstream behaviour).
    const dockerErrors = /\/api\/environment\//;
    KNOWN_ERRORS.push(dockerErrors);
    const docker = await api(page, "GET", `/api/environment/image?daemonId=${daemonId}`);
    if (docker.status < 500) KNOWN_ERRORS.splice(KNOWN_ERRORS.indexOf(dockerErrors), 1);
    const name = `e2e-${Date.now()}`;

    // 1. Create an instance running `cat`, which echoes every console line back.
    const created = await api(page, "POST", `/api/instance?daemonId=${daemonId}`, {
      nickname: name,
      startCommand: "cat",
      stopCommand: "^C",
      cwd: "",
      ie: "utf-8",
      oe: "utf-8",
      processType: "general",
      type: "universal",
      tag: []
    });
    expect(created.status).toBe(200);
    const instanceId: string = created.data.instanceUuid;
    expect(instanceId).toBeTruthy();
    const q = `daemonId=${daemonId}&instanceId=${instanceId}`;

    try {
      // 2. Every route of the UI.
      const routes = [
        "#/",
        "#/instances",
        `#/instances/terminal?${q}`,
        `#/instances/terminal/files?${q}`,
        `#/instances/terminal/mods?${q}`,
        `#/instances/terminal/serverConfig?${q}`,
        `#/instances/schedule?${q}`,
        "#/quickstart",
        "#/quickstart/minecraft",
        "#/market",
        "#/market/editor",
        "#/overview",
        "#/users",
        "#/node",
        `#/node/image?daemonId=${daemonId}`,
        `#/node/image/new?daemonId=${daemonId}`,
        "#/audit",
        "#/settings",
        "#/user",
        "#/customer",
        "#/404"
      ];
      for (const hash of routes) {
        await openPage(page, hash);
        await expect(page.getByText("has not been ported to React yet"), hash).toHaveCount(0);
      }

      // 3. Start the instance from the terminal page, send a line, read it back.
      await openPage(page, `#/instances/terminal?${q}`);
      const opened = await api(page, "GET", `/api/protected_instance/open?daemonId=${daemonId}&uuid=${instanceId}`);
      expect(opened.status).toBe(200);
      const input = page.locator("input").filter({ has: page.locator("xpath=self::*[@placeholder]") }).last();
      const marker = `hello-${Date.now()}`;
      await expect(async () => {
        await input.fill(marker);
        await input.press("Enter");
        const log = await api<string>(page, "GET", `/api/protected_instance/outputlog?daemonId=${daemonId}&uuid=${instanceId}`);
        expect(String(log.data ?? "")).toContain(marker);
      }).toPass({ timeout: 30_000 });

      // 4. Instance settings dialog: every tab opens.
      await page.getByText("Instance Settings", { exact: true }).first().click();
      const dialog = page.locator(".ant-modal").last();
      await expect(dialog).toBeVisible();
      // The command helper (Johnnykins fork) fills the start command field.
      await dialog.getByRole("button", { name: "Command Helper" }).click();
      const helper = page.locator(".ant-modal").last();
      await helper.getByText("Minecraft Game Server").click();
      await helper.getByPlaceholder("Usually a .jar file, like paper.jar, etc.").fill("e2e.jar");
      await helper.getByRole("button", { name: "Confirm" }).click();
      await expect(dialog.locator("textarea").filter({ hasText: "-jar e2e.jar nogui" })).toHaveCount(1);
      for (const tab of await dialog.locator(".ant-tabs-tab").all()) await tab.click();
      await dialog.getByRole("button", { name: /Cancel/ }).click();

      // 5. File manager: create a file through the API, see it listed.
      const fileName = `${name}.txt`;
      const touched = await api(page, "POST", `/api/files/touch?daemonId=${daemonId}&uuid=${instanceId}`, { target: `/${fileName}` });
      expect(touched.status).toBe(200);
      await openPage(page, `#/instances/terminal/files?${q}`);
      await expect(page.getByText(fileName).first()).toBeVisible({ timeout: 20_000 });

      await api(page, "GET", `/api/protected_instance/kill?daemonId=${daemonId}&uuid=${instanceId}`);
    } finally {
      // 6. Clean up.
      const del = await api(page, "DELETE", `/api/instance?daemonId=${daemonId}`, { uuids: [instanceId], deleteFile: true });
      expect(del.status).toBe(200);
    }

    expect(problems).toEqual([]);
  });
});
