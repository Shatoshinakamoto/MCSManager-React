# Security log

Entries follow the template in the project's secure development standards. Newest first.

## 2026-10-26 - Panel users linked to OS accounts: safe folder hand-over and per-account Java
- **Type:** new feature with security controls (OpenSpec change `link-panel-users-to-os-accounts`)
- **CVE / CWE / advisory:** none; CWE-250, CWE-269, CWE-639, CWE-59, CWE-61, CWE-367, CWE-732, CWE-276, CWE-636, CWE-22, CWE-78, CWE-88
- **Severity:** not CVSS-scored; high by assessment if done naively, because a root daemon changes file owners for other accounts: a `chown -R` that follows a planted link, or a uid taken from a request, would hand host files to an instance user.
- **Affected:** daemon `src/tools/os_account.ts`, `src/tools/owner_tree.ts`, `src/tools/windows_acl.ts`, `src/tools/file_ownership.ts`, `src/tools/system_user.ts`, `src/service/os_account_binding.ts`, `src/routers/os_account_router.ts`, `src/service/java_manager.ts`, `src/routers/java_manager_router.ts`, `src/routers/file_router.ts`, `src/routers/http_router.ts`, `src/service/docker_process_service.ts`, start/install/update commands; panel `src/app/service/os_account_service.ts`, `routers/user_overview_router.ts`, `routers/manage_user_router.ts`, `service/exchange_service.ts`, `routers/java_manager_router.ts`; React `widgets/UserList.tsx`, `widgets/user/AccessSettings.tsx`, `widgets/instance/dialogs/InstanceDetail.tsx`, `widgets/instance/dialogs/JavaManager.tsx`.
- **What changed:**
  - Only a Web Admin can set a user's `osAccount` (NIST AC-5, AC-6); Admins' attempts are ignored and logged. The panel stores names only and derives affected instances from its own records, never from the request (CWE-639).
  - Nodes resolve names with `execFile` and fixed patterns (no numeric ids, no options, CWE-88), refuse uid 0 even with `allowRoot` (CWE-250), apply `allowedUsers`, and need root to change a process account.
  - One identity per instance; identity changes need a stopped instance; parent folders are checked, never changed; only folders strictly below the instance data folder or `handOverPaths` are walked, so a working directory of `/` or `/etc` cannot be given away (CWE-22).
  - The hand-over opens every entry with `O_NOFOLLOW` through `/proc/self/fd/<dir>`, re-checks device and inode, and uses `fchown`/`fchmod`; symlinks, other file systems and hard-linked files are skipped (CWE-59, CWE-61, CWE-367). setuid/setgid are dropped and the top folder is closed to other accounts (CWE-732, CWE-276).
  - Panel edits run check on every node, then apply, then save; a refused or failed node stores nothing and the error says what already changed (no false success). Unlinking is best effort so access removal never waits for a node.
  - Linked instances fail closed: no start and no file manager write when the account cannot be used (CWE-636). Writes resolve the owner before writing.
  - Per-account Java runtimes: unpacked in a root-only staging folder, handed over, then moved into a root-owned 0711 scope folder with root-owned 0600 records; another account's runtime cannot be selected; removal runs `rm -rf` as the owning account, so root never walks an account-owned tree.
  - Windows: SID lookup by a fixed `-EncodedCommand` PowerShell script with the name in an environment variable; only account SIDs (`S-1-5-21-…`, RID ≥ 1000, not a local group) get `icacls` grants; the previous account's grant is removed on change (CWE-78).
- **Why it is secure now:** the host account is chosen only by host administrators, checked again on every node, and applied by a walk that a user who controls the folder cannot redirect outside it (ASVS V4.1.3; NIST AC-6, SI-11; the least-privilege requirement of the Application Security and Development STIG).
- **Residual risk:**
  - SECURITY-WARNING: a Web Admin on a root daemon can still reach root through the global terminal and file manager.
  - SECURITY-WARNING: a linked account owns and can change everything in its instance folders, including start scripts.
  - TODO(security): file manager delete and reinstall still remove files as root inside account-owned folders (path-based, open to a symlink race); upstream behaviour for any instance that runs as another account.
  - TODO(security): macOS has no `/proc/self/fd`: hand-over is refused there (only already-owned folders are accepted) and file manager owner changes still validate by path.
  - TODO(security): Windows support is only tested with a mocked runner; domain group names are not recognised as groups.
  - TODO(security): Docker user-namespace remapping is not detected.
- **Verification:** daemon tests as root with real accounts (owner walk incl. a link swapped in mid-path, policy, bindings, fail-closed writes, after-install hand-over, per-account Java), panel tests (Web Admin only, check → apply → save, refusal stores nothing, offline unlink), UI tests; live on a root daemon with `alice` and `bob` through the panel API (27 checks: owners and modes, `/etc/shadow` link and outside hard link untouched, process runs as `alice`, root and mixed identities refused, Admin cannot link) and in Chromium (field, validation, root refusal message, locked Run As, Java scope; `alice`'s own runtime ran as `alice`).

## 2026-10-26 - Framed-page message bridge locked to allowed origins
- **Type:** hardening (port of an upstream component that is not opened yet)
- **CVE / CWE / advisory:** none; CWE-346, CWE-940, CWE-284, CWE-1021
- **Severity:** not CVSS-scored; would be high if a page ever used upstream's version with an untrusted address, because any framed page could ask for the user's API key. Not reachable in upstream or this port today.
- **Affected:** `frontend-react/src/components/IframeBox/config.ts`, `handler.ts`, `index.tsx`, `frontend-react/src/components/IframeModal/index.tsx`.
- **What changed (against upstream `components/IframeBox`):**
  - The bridge is off unless the caller turns it on and the framed page is on the panel's origin or in `allowedOrigins`. Each message must come from that frame's window and that origin; replies go to that origin, not `*`.
  - Handler names are looked up as own properties only, so `constructor` or `__proto__` cannot be called.
  - `MainAppInfo` and `GetRemoteAppDaemons` ask the user before turning on an API key; upstream did it silently.
  - `OpenNewIframePage` opens http(s) addresses only and keeps the same allow-list.
  - The frame is sandboxed like the iframe card (no navigation of the panel tab) and sends no referrer.
- **Why it is secure now:** a page can only reach the bridge if an admin-written caller names its origin, and the user still decides whether it gets an API key (ASVS V14.5.2, NIST AC-3). Panel calls are authorised by the panel as before.
- **Residual risk:** a page on an allowed origin that the user lets have an API key can use the panel as that user until the key is turned off in the profile.
- **Verification:** 5 unit tests in `src/__tests__/leftovers.test.tsx` (origin rules, hostile handler names, reply origin, no listener while off or not allowed).

## 2026-10-26 - "Run As" limited to Web Admins and root daemons; daemon HTTP hardening
- **Type:** hardening (new controls on an upstream feature, plus fork port)
- **CVE / CWE / advisory:** none; CWE-250, CWE-269, CWE-88, CWE-78, CWE-79, CWE-770, CWE-348
- **Severity:** not CVSS-scored; high by assessment for a root daemon without `defaultUser`, where any panel Admin who can edit a start command runs code as root.
- **Affected:** `daemon/src/tools/system_user.ts`, `daemon/src/tools/file_ownership.ts`, `daemon/src/routers/Instance_router.ts`, `daemon/src/routers/info_router.ts`, `daemon/src/service/johnnykins/http_security.ts`, `daemon/src/service/http.ts`, `daemon/src/app.ts`, `panel/src/app/service/run_as_policy.ts`, `panel/src/app/routers/instance_admin_router.ts`, `frontend-react/src/widgets/instance/dialogs/InstanceDetail.tsx`.
- **What changed:**
  - Only a Web Admin/Owner can set `runAs`; for other callers the panel drops the key (NIST AC-5, AC-6). Market templates cannot carry one.
  - The daemon switches accounts only as root, refuses root (uid 0) unless `allowRoot`, enforces `allowedUsers`, and runs instances without `runAs` as `defaultUser` when set. A root daemon without `defaultUser` warns at startup.
  - Account lookup moved from `exec("id -u " + name)` to `execFile("id", ["-u", "--", name])` with a strict name pattern; upstream's filter allowed a leading `-` (CWE-88).
  - Daemon HTTP: CSP `default-src 'none'; … sandbox`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`; the information page gets a hash-pinned script CSP. Optional CORS allow-list and per-IP rate limiter keyed on the socket address (the fork keyed on spoofable headers, CWE-348). Optional PandorasWall middleware lock.
- **Why it is secure now:** the OS account is a decision of the host's administrators only, root is never chosen by accident, and the daemon (not only the UI) enforces it (ASVS V4.1.1).
- **Residual risk:**
  - SECURITY-WARNING: a Web Admin on a root daemon can still reach root through the global terminal and global file manager. Documented in docs/install-guide.md.
  - SECURITY-WARNING: membership of the `docker` group is root-equivalent; the install guide recommends rootless Docker for non-root daemons.
  - The folder access hint ignores supplementary groups (may warn needlessly).
- **Verification:** daemon tests (policy, name pattern, access hint, HTTP helpers), panel test (Web Admin only), UI test (field state); live on a root daemon: `root` refused with `allowRoot` off, `nobody` started; daemon page rendered with no CSP errors; systemd units pass `systemd-analyze verify`.

## 2026-10-25 - Session token out of URLs; SSO token no longer logged
- **Type:** hardening
- **CVE / CWE / advisory:** none; CWE-598, CWE-208, CWE-532
- **Severity:** not CVSS-scored; low to medium by assessment (needs access to logs or browser history).
- **Affected:** `panel/src/app/middleware/permission.ts`, `panel/src/app/routers/instance_exchange_router.ts`, `frontend-react/src/services/apiService.ts`.
- **What changed:**
  - The React UI sends the session token in the `X-MCSM-Token` request header instead of the `?token=` query parameter, so it no longer lands in proxy, access or browser logs (CWE-598, ASVS V3.1.1).
  - The panel reads the header first and falls back to `?token=` for existing scripts. Both are compared with `crypto.timingSafeEqual` through `sessionTokenMatches()`, which refuses a missing or empty token on either side (CWE-208).
  - The SSO login route no longer writes the one-time token to the panel log (CWE-532, NIST AU-9). Upstream logged it.
- **Why it is secure now:** credentials travel only in headers from the UI; comparison time does not depend on how much of the token matches.
- **Residual risk:**
  - TODO(security): `?token=` is still accepted for compatibility. Remove it in a later release once scripts have moved; the [upgrade guide](upgrade-guide.md) asks them to.
  - Daemon file upload and download links still carry upstream's one-time transfer password in the URL path. That password is issued per transfer and expires quickly; the session token is not in those links.
- **Verification:** panel test `session_token.test.ts` (header, query fallback, empty and length-mismatch refusal); panel tests 65 passing; terminal and file pages checked in the browser with no token in any request URL; the browser smoke test asserts the same on every main page.

## 2026-10-25 - Legacy plugin API through a sandboxed host
- **Type:** feature with hardening
- **CVE / CWE / advisory:** none; CWE-94, CWE-829, CWE-285, CWE-79, CWE-434, CWE-770, CWE-22
- **Severity:** not CVSS-scored; the design keeps third-party plugin code outside the panel origin.
- **Affected:** `frontend-react/public/plugin-host.html`, `frontend-react/src/tools/legacyPluginBridge.ts`, `frontend-react/src/widgets/others/PluginCard.tsx`, `frontend-react/src/services/apiService.ts` (`rawPanelGet`), `panel/src/app/middleware/additional_security.ts`, `panel/src/app.ts`, `panel/src/app/routers/settings_router.ts`.
- **What changed:**
  - Old plugins run in `plugin-host.html`, loaded in an iframe sandboxed without `allow-same-origin`. The panel also sends that page a CSP `sandbox` directive, so it is an opaque origin even when opened directly. Its CSP allows inline and http(s) scripts, never `'unsafe-eval'`, and `frame-ancestors 'self'`. The panel page's own CSP is unchanged.
  - The host recreates `$axios`, `$theme`, `$realWindow` (the frame's own window), `$onMounted`, `$onUnmounted`. `$axios` to other sites is a credential-less fetch; to the panel it becomes a message to the plugin card.
  - The card accepts messages only from its own frame (`event.source`, origin `"null"`). It answers 403 unless the admin enabled panel data for the card; then only GET on six read-only endpoints, after path normalisation, with token/API-key parameters dropped, parameters capped, 30 requests per 10 s. Requests run as the viewing user, so the panel's own permission checks still apply.
  - Plugin `.html` uploads are accepted again (2 MB cap). All markup and script files under `upload_files` are served as inert text in a CSP sandbox, which also neutralises HTML uploaded by older versions.
- **Why it is secure now:** plugin code cannot reach panel cookies, storage, DOM or navigation (ASVS V14.4, V5.3); panel data access is default-deny, least privilege and read-only (NIST AC-3, AC-6).
- **Residual risk:**
  - SECURITY-WARNING: with panel data on, a plugin can read instance and daemon details visible to the viewer and send them to its own server. The setting text warns about this; turn it on only for trusted plugins.
  - SECURITY-WARNING: plugins that need write access or panel internals (`$realWindow` as the panel window) no longer work. That is deliberate.
- **Verification:** an old-style test plugin rendered with theme, `$onMounted`, external fetch and (when allowed) `/api/overview`; from inside it, cookies, `localStorage`, `parent.document`, `eval`, top navigation, a POST, `/api/auth/overview` and two path-traversal variants were all refused. Direct open of an uploaded `.html` returned `text/plain` with `sandbox`. React tests 63 passing, panel tests 63 passing.

## 2026-10-25 - Phase 4: decorative cards and React cutover
- **Type:** hardening (port with fixes)
- **CVE / CWE / advisory:** none; CWE-94, CWE-829, CWE-1021, CWE-79, CWE-601, CWE-95, CWE-540
- **Severity:** not CVSS-scored; high by assessment for upstream's plugin card, which ran any page's scripts in the panel with the user's session.
- **Affected:** `frontend-react/src/widgets/others/*`, `frontend-react/src/tools/safeUrl.ts`, `panel/src/app/middleware/additional_security.ts`, `panel/src/app/routers/settings_router.ts`, `build.sh`, `build.bat`.
- **What changed:**
  - Plugin card: upstream fetched a URL, inserted the HTML with `innerHTML` and ran its scripts through a proxy sandbox that still exposed `window` and an authenticated axios. Now the page loads in an `<iframe sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox">` with no `allow-same-origin`, `referrerPolicy="no-referrer"`, absolute http(s) URLs only. It gets the theme by `postMessage` and nothing else. Plugins that relied on the panel's `window` or API client no longer work.
  - Iframe card: sandboxed without `allow-top-navigation`, so an embedded page cannot replace the panel.
  - Image, carousel and link cards: URLs pass `safeHttpUrl` before they are saved or rendered; links open with `noopener,noreferrer`. Text card renders through the existing Markdown sanitiser.
  - Asset upload allow-list gains audio types; HTML and other types are still refused.
  - CSP: the `'unsafe-eval'` fallback for the Vue build is removed (closes the TODO(security) of the tamper-check entry below).
  - Build scripts keep the UI sourcemaps out of the served web root.
- **Why it is secure now:** third-party card content runs in an opaque origin with no access to the panel's DOM, cookies or storage (ASVS V14.4, V5.3); untrusted URLs are allow-listed by scheme; the CSP no longer permits string-to-code evaluation.
- **Residual risk:**
  - SECURITY-WARNING: the iframe card keeps `allow-same-origin` (needed by most embedded sites). Do not point it at a page on the panel's own origin that you do not control.
  - SECURITY-WARNING: `frame-src` and `img-src` still allow any http(s) host, because layout cards embed external content by design.
- **Verification:** React tests 44 passing (26 new); panel CSP test passing; browser run against the panel: `javascript:` slides and links dropped, 0 alerts, markdown `onerror` stripped, plugin frame cannot read cookies or the parent; `build.sh` output starts, passes the tamper check, sends `script-src 'self'` with no eval, and returns 404 for sourcemaps.

## 2026-10-25 - Fork features: tamper check, dev-tools blocker, CSP for the served UI
- **Type:** hardening (ported from the Johnnykins fork)
- **CVE / CWE / advisory:** none; CWE-354, CWE-79 (defence in depth), CWE-95 (residual)
- **Severity:** not CVSS-scored; informational to low.
- **Affected:** `common/src/tamper_check.ts`, `common/tamper_proof_plugin.js`, `common/src/upgrade.ts`, panel and daemon `app.ts`, `frontend-react/src/tools/devBlocker.ts`, `panel/src/app/middleware/additional_security.ts`.
- **What changed:**
  - Build integrity check: SHA-256 of `app.js` and `app.js.map` written at build, compared at startup; mismatch or missing hashes stop the process, except a `--dev` run under the fork's conditions. The self-updater refreshes the hashes after applying a package.
  - Dev-tools blocker, off by default. Libraries pinned and bundled instead of the fork's unpinned jsDelivr script; the library's third-party fallback redirect (which carried the panel host name) replaced with `about:blank`.
  - CSP `script-src 'self'` plus SHA-256 hashes of the inline scripts in the served `index.html`; inline handlers only by hash with `'unsafe-hashes'`.
- **Why it is secure now:** integrity of the deployed bundle is checked before it serves requests (NIST SI-7, detection only); the CSP blocks injected inline script even if an XSS sink is found (ASVS V14.4.3).
- **Residual risk:**
  - SECURITY-WARNING: the hash files sit beside the bundle, so an attacker with write access can update both. Install-folder permissions are the real control.
  - SECURITY-WARNING: the dev-tools blocker deters casual inspection only and is not a security boundary.
  - SECURITY-WARNING: frontends without `<meta name="mcsm-csp" content="strict">` (the upstream Vue build) get `'unsafe-eval'`, because vue-i18n compiles messages at runtime. Resolved: removed at the Phase 4 cutover (entry above).
- **Verification:** `common` tests (6 new, all passing); manual runs: an edited `app.js` and a missing `app_map-hash.txt` each stop the panel with exit code 1; the React build loads under the strict CSP with no violations; the Vue build loads with no CSP violations.

## 2026-10-25 - Fork features: Web Admin role and Additional Security middleware
- **Type:** hardening (ported from the Johnnykins fork, with fixes)
- **CVE / CWE / advisory:** none; CWE-269, CWE-613, CWE-942, CWE-290, CWE-348, CWE-770
- **Severity:** not CVSS-scored; medium by assessment for the fork's IP-header bypass that this port does not repeat.
- **Affected:** `panel/src/app/service/web_admin.ts`, `middleware/permission.ts`, `middleware/additional_security.ts`, `routers/*` (route levels), `routers/settings_router.ts` (validation), `service/passport_service.ts`.
- **What changed:**
  - `ROLE.WEBADMIN = 20`. Panel-wide routes need it once `webAdminEnforced` is on; until then it maps to `ROLE.ADMIN`. Unknown permission numbers are refused; only Web Admins grant the role or manage Web Admins (bootstrap: any admin while none exists); the last Web Admin cannot be removed; only a Web Admin can turn enforcement on.
  - Security headers via `koa-helmet`; CORS allow-list of exact origins via `@koa/cors`; per-IP `/api/` limiter via `koa-ratelimit` with an IP allow-list; absolute login lifetime bound to the login IP; PandorasWall freezes the middleware list after startup.
  - Fork bug not repeated: the fork took the client IP from `X-Forwarded-For`, `CF-Connecting-IP` or `True-Client-IP` on every request, so any client could claim a whitelisted daemon address and skip the limiter. The port uses `ctx.ip` (proxy header only in reverse-proxy mode).
- **Why it is secure now:** least privilege for panel-wide actions (NIST AC-6), server-side authorisation (ASVS V4.1), session timeout (ASVS V3.3), input validation on every new setting (ASVS V5.1).
- **Residual risk:** the limiter's memory store is per process and resets on restart. Plain admins keep instance management by design.
- **Verification:** live API run with a Web Admin and a plain admin: plain admin refused on settings (403) and on granting Web Admin, allowed on overview; enforcement switch refused for the plain admin; limiter returned 429 after 5 requests at max 5; CORS echoed only the listed origin; PandorasWall logged the lock; invalid origin and allow-list values rejected. UI: plain admin's menu hides Users and Settings and `/settings` goes to 404.

## 2026-10-25 - React Phase 3 port: admin and instance-creation pages
- **Type:** patch
- **CVE / CWE / advisory:** none; CWE-79, CWE-22, CWE-434, CWE-549, CWE-201
- **Severity:** not CVSS-scored; low to medium by assessment.
- **Affected:** upstream `frontend/` Docker image pages, market, users page; upstream `panel/src/app/routers/instance_admin_router.ts` local market path.
- **What changed:**
  - Docker image and container details render as text; upstream set `innerHTML` from JSON returned by the Docker host (CWE-79).
  - Market package images and links pass `safeHttpUrl` (http(s) or same-origin path only); others show a dash (CWE-79 via `javascript:` URLs).
  - Market templates uploaded through `upload_assets` are parsed, checked for `{ packages: [] }` and capped at 20 MB before they are saved as `.json` (CWE-434).
  - A local market path is resolved and must stay inside `public/upload_files` (CWE-22).
  - The market editor's link import uses `credentials: "omit"` so panel cookies never go to the template host (CWE-201).
  - Users page new-password field is masked (CWE-549).
- **Why it is secure now:** output encoding and URL allowlists (ASVS V5.3), file upload validation (OWASP File Upload Cheat Sheet), path confinement (ASVS V12.3).
- **Residual risk:** `npm audit` on the panel reports the same findings as upstream `ad4f903`, all in existing dependencies: production `follow-redirects` (high), `zod` via `koa-body` (high), `uuid` via `koa-session` (moderate); dev-only `vitest`/`esbuild`/`tinypool` chain. The four packages added in this port add none. TODO(security): update these with upstream.
- **Verification:** `npm audit` run on 2026-10-25 against this lockfile and against upstream's (identical counts: 12 total, 5 production); XSS probes with a `javascript:` image and HTML in descriptions fired no script; Playwright runs of market install, quick start and editor publish.

## 2026-10-25 - React instance console: hardening during the Phase 2 port
- **Type:** patch
- **CVE / CWE / advisory:** none; CWE-201, CWE-79, CWE-549, CWE-20, CWE-1022, CWE-918 (residual)
- **Severity:** not CVSS-scored; low to medium by assessment.
- **Affected:** upstream `frontend/` instance console behaviours reproduced by the port.
- **What changed:**
  - Session token sent only to same-origin (panel) URLs. Upstream also appended it to direct daemon upload URLs, handing it to a second origin (CWE-201). `src/services/apiService.ts`.
  - Translation strings with markup render through `src/components/SafeHtml.tsx` (DOMParser plus tag allowlist, http(s) links only) instead of `v-html` (CWE-79).
  - RCON password shown in a masked field (CWE-549).
  - File manager tabs and mod manager settings read from localStorage are shape-checked, with a one-day expiry for tabs (CWE-20).
  - External links (mod pages, file downloads) open with `noopener noreferrer` and encoded URLs (CWE-1022); mod icons load only from http(s) URLs.
  - Download-from-URL dialog accepts http(s) only. The daemon's `checkSafeUrl` rejects IP literals, local names and private DNS answers.
  - Editing a schedule deletes and re-creates it as upstream does; if the re-create fails the original task is registered again, so an edit can no longer silently delete the task.
- **Why it is secure now:** output encoding and allowlists (ASVS V5.3), credentials limited to their own origin (ASVS V3.4), untrusted client storage validated (ASVS V5.1).
- **Residual risk:** SECURITY-WARNING: the daemon resolves the URL for its SSRF check and again for the fetch, so DNS rebinding can still reach a private address (CWE-367/CWE-918). TODO(security): pin the checked address for the fetch.
- **Verification:** `npx tsc --noEmit`, `npm audit` (0 vulnerabilities, 2026-10-25), Playwright runs of the file manager, schedules, server config and mod manager against a live panel and daemon.

## 2026-10-25 - Upstream: any file type accepted by the asset upload (fixed in port)
- **Type:** patch
- **CVE / CWE / advisory:** none; CWE-434, CWE-79
- **Severity:** not CVSS-scored; medium by assessment (admin-only endpoint, but an uploaded .html or .svg is served from the panel's own origin and runs script there, for example against other admins who open the link).
- **Affected:** upstream `panel/src/app/routers/settings_router.ts` `POST /upload_assets`.
- **What changed:** extension allow-list (png, jpg, jpeg, gif, webp, ico); the saved name keeps only the lower-cased allowed extension. The React upload dialog sets the same `accept` list.
- **Why it is secure now:** files that browsers would render as active content can no longer be placed in `public/upload_files` (OWASP File Upload Cheat Sheet). SVG is excluded on purpose because it can carry script.
- **Verification:** live test 2026-10-25: `x.html` refused, `x.png` accepted (`/tmp` repro script, not committed).

## 2026-10-25 - Upstream: login session token written to the panel log (fixed in port)
- **Type:** patch
- **CVE / CWE / advisory:** none; CWE-532
- **Severity:** not CVSS-scored; medium by assessment (anyone who can read the panel log or its shipped copies can reuse a live session's token together with its cookie).
- **Affected:** upstream `panel/src/app/service/passport_service.ts` `login()` (`[LOGIN] Token: ...`).
- **What changed:** the line is removed; the login event still records user and IP.
- **Why it is secure now:** bearer values are not logged (NIST AU-9, OWASP Logging Cheat Sheet).
- **Verification:** log in, then `grep -c "Token:" panel/production/logs/*.log` stays at the pre-login count.

## 2026-10-25 - React charts: echarts version choice (avoided)
- **Type:** dependency
- **CVE / CWE / advisory:** GHSA-fgmj-fm8m-jvvx (echarts XSS, reported by npm audit for 5.x); CWE-79
- **Severity:** npm audit "moderate"; CVSS/EPSS/KEV not looked up.
- **Affected:** would have affected `frontend-react` if it used echarts 5.6.0 like upstream `frontend/`.
- **What changed:** `frontend-react` pins `echarts@6.1.0`. Tooltip formatters HTML-escape every value from the panel (`src/hooks/useOverviewChart.ts`).
- **Why it is secure now:** patched version plus output encoding (ASVS V5.3.3). The upstream Vue UI still uses 5.x until cutover.
- **Verification:** `cd frontend-react && npm audit` (0 vulnerabilities, 2026-10-25).

## 2026-10-25 - Daemon ban list keyed on spoofable headers (fixed in port)
- **Type:** patch
- **CVE / CWE / advisory:** none; CWE-290, CWE-348, CWE-307
- **Severity:** not CVSS-scored; high by assessment (unlimited guessing of the daemon key by rotating headers).
- **Affected:** fork `daemon/src/routers/auth_router.ts` `getIpAddress()` / `banDB`.
- **What changed:** `daemon/src/service/johnnykins/ban_list.ts` keys bans on the socket address; `X-Forwarded-For` is read only when the peer is in `johnnykins.ban.trustedProxies`. Bans carry explicit expiry; success resets the count.
- **Why it is secure now:** the ban key can't be chosen by the client (NIST AC-7).
- **Verification:** live test 2026-10-25: wrong key refused with `bad_key`; ban list code reviewed.

## 2026-10-25 - Legacy passport store overwrite and replay (fixed in port)
- **Type:** patch
- **CVE / CWE / advisory:** none; CWE-294, CWE-664
- **Severity:** not CVSS-scored; medium by assessment (availability: daemons failed to connect intermittently; passports replayable for 5 minutes).
- **Affected:** fork `panel/src/app/common/johnnykins.ts` `LimitedLRUArray`, `RemotePassports`.
- **What changed:** `LegacyPassportStore` in `common/src/passport/legacy.ts`: unique ids, bound 256, 60 s TTL, single-use `take()`, constant-time matching across all entries.
- **Why it is secure now:** a passport can be used once and can't be overwritten by another daemon's.
- **Verification:** `cd common && npx vitest run src/__test__/johnnykins.test.ts` (11 passed); live test 6/6 legacy reconnects.

## 2026-10-25 - Passport secrets in logs and settings API (fixed in port)
- **Type:** hardening
- **CVE / CWE / advisory:** none; CWE-532, CWE-200
- **Severity:** not CVSS-scored; medium by assessment.
- **Affected:** fork logged every passport (`Passport Answer:`) and `Data recieved on auth:`; upstream `GET /api/overview/setting` returned `gatewaySecret`.
- **What changed:** nothing secret is logged by the new handshake; the settings API strips `gatewaySecret` and all `johnnykins` secrets; node APIs never return the per-node pairing.
- **Verification:** `remote_services_list` returned only `uuid, ip, port, prefix, available, remarks` in the live test.

## 2026-10-25 - Command sanitizer rewrite (fixed in port)
- **Type:** hardening
- **CVE / CWE / advisory:** none; CWE-1333, CWE-185, CWE-150, CWE-532
- **Severity:** low by assessment.
- **Affected:** fork `daemon/src/entity/commands/*sanitize.ts`.
- **What changed:** literal matching instead of `new RegExp(entry)`, reject instead of silent substring removal, shell blacklist only for shell instances, no command text in logs.
- **Why it is secure now:** config entries can't cause ReDoS or crashes; behaviour is predictable. Still defence in depth only (see the feature page).
- **Verification:** `johnnykins.test.ts` sanitizer cases; daemon integration test for interactive stdin passes.

## 2026-10-25 - Upstream: TLS verification disabled for wss daemons (open)
- **Type:** accepted risk (upstream, not changed yet)
- **CVE / CWE / advisory:** none; CWE-295
- **Severity:** not CVSS-scored; medium by assessment.
- **Affected:** upstream `panel/src/app/entity/entity_interface.ts` `connectOpts.rejectUnauthorized: false`.
- **What changed:** nothing yet. Changing it breaks daemons that use self-signed certificates. TODO(security): add a per-node CA/fingerprint setting and default to verification on.
- **Mitigation:** standard passport mode authenticates the daemon with its proof, so a man in the middle can't pass as the daemon after pairing.

## 2026-10-25 - Legacy passport: regex token comparison auth bypass (fixed in port)
- **Type:** patch
- **CVE / CWE / advisory:** none (project-specific); CWE-185, CWE-287, CWE-1333, CWE-208
- **Severity:** not CVSS-scored. Critical by assessment: unauthenticated callers of the fork's `/api/auth/daemon-verifications` could pass verification with a header value of `.*`.
- **Affected:** Johnnykins-MCSManager fork (panel 10.2.1 base): `panel/src/app.ts` (`String(obj.key).match(String(header))`), `johnnykins.ts` `verifyJohnsAsymmSha256Wrapper` (`token.match(expected)`).
- **What changed:** the ported `common/src/passport/legacy.ts` compares every passport field with `crypto.timingSafeEqual` on equal-length buffers (`safeEqual`, `matchLegacyPassport`, `verifyJohnsAsymmSha256Wrapper`).
- **Why it is secure now:** exact constant-time comparison; no attacker-controlled regular expressions (OWASP ASVS V2.9, CWE-185/208).
- **Verification:** `cd common && npx vitest run src/__test__/passport.test.ts` (15 passed), including `.*`, prefix and suffix bypass attempts.

## 2026-10-25 - Legacy passport: weak randomness (fixed in port)
- **Type:** hardening
- **CVE / CWE / advisory:** none; CWE-338, CWE-331
- **Severity:** not CVSS-scored; medium by assessment.
- **Affected:** fork `customToken.ts` (Math.random shuffle, modulo bias), `entropyTokenCreation` (Math.random), `tokenV2`/`tokenV3` (`randomBytes(n).toString("utf8")` replaces invalid bytes with U+FFFD).
- **What changed:** `crypto.randomInt` for multipliers and symbol choice; `base64url` encoding for random bytes.
- **Why it is secure now:** CSPRNG only, full entropy retained (NIST SP 800-90A via OpenSSL, CWE-338).
- **Verification:** passport tests "keeps full randomness in tokens", "caps entropy at 10".

## 2026-10-25 - Legacy passport scramble layers (accepted risk, documented)
- **Type:** accepted risk
- **CVE / CWE / advisory:** none; relates to CWE-327 (non-approved construction)
- **Severity:** low; HMAC-SHA256 underneath remains the security boundary.
- **Affected:** `common/src/passport/legacy.ts` `JohnsNonAsymmSha256Wrapper`.
- **What changed:** kept at the owner's request as the `johnnykins-legacy` mode. `standard` mode (HKDF + HMAC-SHA256 challenge-response) is the default.
- **Why it is acceptable:** the scramble is a keyed deterministic permutation on top of HMAC outputs; it does not weaken HMAC but adds no approved strength. Use `standard` where FIPS 140-3 / NIST SC-13 applies.
- **Verification:** n/a (design decision).

## 2026-10-25 - React UI hardening relative to upstream Vue UI
- **Type:** hardening
- **CVE / CWE / advisory:** none; CWE-79, CWE-350, CWE-540
- **Severity:** low to medium by assessment.
- **Affected:** `frontend-react/`.
- **What changed:** no inline scripts or inline event handlers in `index.html` (enables CSP without `'unsafe-inline'`); DOMPurify allow-list plus URL scheme filter and `rel="noopener noreferrer"` for admin Markdown; escaped, scheme-checked background image URLs; dev server `allowedHosts` limited to localhost (upstream: any host); production sourcemaps `hidden`; layout JSON validated before use; only registered widget types render.
- **Why it is secure now:** ASVS V5.3.3 output encoding, V14.4.3 CSP readiness; DNS-rebinding protection for the dev server.
- **Verification:** `cd frontend-react && npm test` (15 passed), `npm audit` (0 vulnerabilities, 2026-10-25).

## 2026-10-25 - Known vulnerable transitive dependencies in upstream `common` (open)
- **Type:** accepted risk (pending upstream sync)
- **CVE / CWE / advisory:** GHSA-cc8f-xg8v-72m3, GHSA-4c3q-x735-j3r5 (compressing), GHSA-pxg6-pf52-xh8x (cookie), GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh (lodash), plus socket.io-parser and ws advisories reported by npm audit.
- **Severity:** npm audit reports "high"; CVSS/EPSS/KEV not yet looked up.
- **Affected:** `common/` dependency ranges inherited from upstream.
- **What changed:** nothing yet. Tracked for the next dependency pass (`npm audit fix` in `common`, then panel/daemon re-test).
- **Verification:** `cd common && npm audit --omit=dev` (2026-10-25).
