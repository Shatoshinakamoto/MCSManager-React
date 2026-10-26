# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Newest first.
Base: upstream MCSManager commit `ad4f903` (2026-10-24, panel 10.22.0, daemon 4.19.3).

## [Unreleased] - 2026-10-25

### Added
- `frontend-react/`: React 19 + antd 6 port of the web UI, built beside the Vue `frontend/` until cutover. Talks to the unchanged panel API and reuses `languages/*.json` and the saved layout JSON.
  - App shell, top header with menus/theme switch/design-mode/logout, breadcrumbs, hash routing with the upstream route table and guard.
  - Card layout engine (12-column grid, placeholder fill identical to upstream), widget registry with a visible "not ported yet" fallback.
  - Ported screens: install wizard, login (incl. 2FA step and SSO button), `TitleCard`, `EmptyCard`, `Page404`, `LoginCard`.
  - 15 unit/security tests (layout algorithm, route guard, layout validation, XSS sanitising, CSS url escaping).
- `common/src/passport/`: panel/daemon passport library with two modes, `standard` (default) and `johnnykins-legacy` (the Johnnykins fork's algorithm with fixes). 15 tests. Not wired into the panel or daemon yet.
- `docs/` index, changelog, security log, feature and command pages.
- Johnnykins passport wired into the daemon and panel (`daemon/src/service/johnnykins/`, `panel/src/app/service/johnnykins/`): in-band challenge-response handshake, automatic pairing with the fork's `lock`, mutual authentication, and the legacy mode with its `/api/auth/daemon-verifications` call.
- Daemon `johnnykins` config section: `passport`, `ban`, `sanitizer`, `instanceMasterConfig` ([docs](configuration/daemon-johnnykins.md)). Panel `johnnykins.passport` section ([docs](configuration/panel-johnnykins.md)).
- Daemon ban list for failed logins (`data/Security/bans.json`).
- Johnnykins command sanitizer (`common/src/security/command_sanitizer.ts`) on `instance/command` and `stream/input`; daemon-side gates for commands, file manager and Docker.
- `common/src/passport/handshake.ts` (shared wire format) and `LegacyPassportStore`; 11 new tests.
- React UI Phase 1 shell: sidebar layout, phone bottom navigation, profile dialog (API key, password, 2FA), design mode with drag and drop, card resize and the new-card pool.
- React UI Phase 1 widgets: Overview page (`StatusBlock`, `DataOverview`, `NodeOverview`, request and instance charts, operation log) with one shared 3 s poll, and the Daemons page (`NodeList`, `NodeItem`, add/edit daemon dialog, address mappings). Shared components `DataStatistic`, `IconBtn`, `BetweenMenus`, `FadeUp`, `NodeSimpleChart`.
- React UI Phase 1 widgets: Instances page (`InstanceList` with daemon picker, search, tag filter, batch actions and the all-daemons table), instance card (`InstanceShortcut`), tag editor and delete-instance dialogs, `UserStatusBlock`, `UserInstanceList`, `QuickStart`, `DefaultCard`. Promise-based dialogs via `openDialog()`.
- React Settings page (all upstream panes) with a new **Daemon Passport** pane for the Johnnykins passport switches; `LeftMenusPanel` and the asset upload dialog.
- `frontend-react`: `pretty-bytes@7.2.0` (pinned).
- `frontend-react`: `echarts@6.1.0` (pinned) and `src/assets/antd-compat.scss` for the visual differences between antd 6 and ant-design-vue 4.
- React UI Phase 2, the instance console: xterm terminal with start/stop/restart/kill controls, instance info card and function tiles, instance settings dialogs (including Docker options, RCON, events, ping, terminal), file manager (upload with conflict prompt, editor with Ctrl+S, zip/unzip, permissions, download from URL, right-click menu), scheduled tasks, server config overview and structured config editor, mod and plugin manager (local list, enable/disable, search and download, config files).
- `frontend-react`: pinned `@xterm/*`, `codemirror` 6 with language packs and `@uiw/codemirror-theme-tokyo-night`, and `fflate@0.8.3`. `tools/antdStatic.ts` gives themed `message` calls outside components.

- React UI Phase 3, admin and instance creation: Users page (search, role filter, batch delete, add/edit dialog) and user resources page, instance picker for new cards, audit log page, Docker images and create-image pages, quick start flow (create directly, upload, import archive, market), Minecraft preset, app market with tour, market editor (import from file, link or clipboard; edit; publish to the panel), the terminal's reinstall-from-market dialog, the `/sso/bind` page and the background upload bubble.
- Web Admin/Owner role (`ROLE.WEBADMIN = 20`) and Ban (`-1`) from the Johnnykins fork, with server-side grant rules and a React role picker, page guard and menus. Enforcement switch `webAdminEnforced`; the first account of a fresh install is a Web Admin. ([docs](configuration/panel-additional-security.md))
- Additional Security settings from the fork: security headers (Helmet), CORS allow-list, API rate limiter with a daemon IP allow-list, login lifetime, PandorasWall, dev-tools blocker. New React settings pane. ([docs](configuration/panel-additional-security.md))
- Build integrity (tamper) check from the fork for panel and daemon: `common/tamper_proof_plugin.js` writes `app-hash.txt` and `app_map-hash.txt`; `common/src/tamper_check.ts` stops startup on mismatch. The self-updater refreshes the hashes; `build.sh` and `build.bat` ship them.
- The fork's artwork in the React UI (`logo.png`, `daemon_connection_error.png`), its About credits ("Modified By", "Personal Mentor Vampeyer") and the login-info spacing.
- Panel: `@koa/cors@5.0.0`, `koa-helmet@9.0.0`, `helmet@8.3.0`, `koa-ratelimit@6.0.0` (pinned). React: `disable-devtool@0.3.9`, `@fvilers/disable-react-devtools@1.3.0` (pinned).
- Panel `GET /api/overview/systemconfig` (public, fork-compatible) and `devBlocker` / `webAdminEnforced` in `/api/auth/status`.
- Tests: 6 for the tamper check, 3 for the Additional Security helpers, 3 for the Web Admin route guard.
- React UI Phase 4, decorative cards: image, carousel, iframe, text (Markdown), link list, clock (two styles), music player with waveform, and plugin card. Card settings are saved with the layout through `useLayoutCardTools().setMetaValue`.
- `frontend-react`: `wavesurfer.js@7.12.12` (pinned) for the music card. `safeAbsoluteHttpUrl` in `tools/safeUrl.ts`.
- Tests: 26 for the card URL allow-lists and frame sandboxes, 1 for the panel CSP.
- Plugin card "Old plugin API" mode: plugins written for upstream's in-page plugin card (`window.$axios`, `$theme`, `$realWindow`, `$onMounted`, `$onUnmounted`) run again inside `public/plugin-host.html`, a sandboxed host frame. Per-card switch "Allow read-only panel data" lets them read the overview, daemon list and instance lists through a bridge (`tools/legacyPluginBridge.ts`). "Upload HTML File" is back on the plugin card. ([docs](features/legacy-plugins.md))
- Translations of every string this port added, in all 11 non-English languages.
- Tests: 12 for the plugin bridge, 2 for the plugin host policy and inert uploads.
- React UI Phase 5 parity: the business-mode renewal-code dialog on the terminal page (`components/fc/RenewalDialog.tsx`, `services/apis/redeem.ts`); the "fill in the card first" notice for failing previews in the new-card dialog; the manual-copy dialog when the clipboard is unavailable; the "instance has a configuration issue" notice in instance settings instead of a crash. Themed `modal` in `tools/antdStatic.ts`. 4 tests.
- Browser tests: `frontend-react/e2e/` (Playwright 1.63.0, pinned) with security specs (CSP, plugin host sandbox, no sourcemaps) and smoke specs (login, every main page, design mode); `npm run test:e2e`. CI job `.github/workflows/e2e.yml` runs them on a fresh panel. ([docs](commands/frontend-react.md))
- [Upgrade guide](upgrade-guide.md) for moving from upstream or the Johnnykins fork.
- "Run As" rules: only a Web Admin/Owner can set an instance's OS account; the daemon needs root to switch accounts and refuses with a clear message otherwise; new daemon settings `johnnykins.runAs.defaultUser`, `allowedUsers`, `allowRoot`; the instance settings lock the field with the reason, or show the allowed accounts as a list; the console hints at the `chown` command when the account cannot open the instance folder. ([docs](features/run-as-user.md))
- [Install guide](install-guide.md) for root, service-account, own-account, Windows and Docker setups, and systemd unit templates in `prod-scripts/linux/systemd/`.
- From the Johnnykins fork (second audit): daemon switches `instanceMasterConfig.ptyAccess`, `openFrpAccess`, `mcStatus`; daemon HTTP hardening `johnnykins.http` (security headers, CORS allow-list, rate limiter) and `johnnykins.pandorasWall`; panel `johnnykins.remoteService.heartbeatIntervalMs` and `localDaemonRetryMs`, editable in Settings > Daemon Passport. ([daemon](configuration/daemon-johnnykins.md), [panel](configuration/panel-johnnykins.md))
- Daemon `info/overview` reports `runAs` (whether it can switch accounts, and its account limits).
- Tests: 7 daemon and 4 panel tests for "Run As", 5 for the daemon HTTP hardening, 4 for the UI field.

### Changed
- A root daemon logs a warning at startup while `johnnykins.runAs.defaultUser` is empty.
- "Run As" can no longer name root unless `johnnykins.runAs.allowRoot` is on, and market templates can no longer set it.
- React UI loads each card's code on demand (`React.lazy` with a skeleton placeholder). The login page now loads about 1.65 MB of script instead of about 5.5 MB.
- The React UI sends the session token in the `X-MCSM-Token` header instead of `?token=`. The panel reads the header first and still accepts the query parameter for existing scripts.
- **Cutover to the React UI.** `build.sh`, `build.bat`, `install-dependents.*`, the root npm scripts (`npm run dev`, `npm run frontend`, `npm test`) and the CI test workflow now build, install and test `frontend-react/`; Docker images pick this up through `build.sh`. The Vue `frontend/` stays in the tree as the upstream porting reference only (`npm run frontend:vue`).
- Production builds put the UI's sourcemaps in `production-code/frontend-sourcemaps/` instead of the served `web/public/`.
- Panel `POST /api/overview/upload_assets` also accepts audio (mp3, ogg, wav, m4a, flac, aac) for the music card.
- Panel `POST /api/overview/upload_assets` also accepts a market template (`.json`, or no extension, parsed and checked for `{ packages: [] }`, 20 MB cap) so the market editor can publish to the panel.
- Panel-wide routes require `ROLE.WEBADMIN`, which falls back to `ROLE.ADMIN` until `webAdminEnforced` is on, so upgraded panels behave as before.
- `crossDomain`'s `*` header is skipped while the CORS allow-list is on.
- `common`: exports the passport module; adds `seedrandom@3.0.5` (legacy scramble) and `@types/seedrandom@3.0.8`.

### Removed
- Panel CSP: the `'unsafe-eval'` fallback for frontends without the `mcsm-csp` strict marker. A non-React `index.html` now only logs a startup warning.

### Fixed
- Daemon: a Web Admin (permission 20) could not use the Minecraft quick install or reinstall from the market, because the daemon only accepted permission 10 for those tasks.
- React UI: right after login, the login animation's delayed redirect could pull the user back to the dashboard after they had already opened another page. Found by the new browser tests. Same fix on the SSO bind page.
- React Settings: leaving the page navigated straight back to it (the `?tab=` cleanup ran against the old route).
- Intermittent daemon connection failures from the fork's auth: passport list overwrite and eviction, passport types 1-3 never verifying, daemon locking itself after a failed sync, missing verification timeout, ban DB startup race. Details in [features/passport-auth.md](features/passport-auth.md#why-connections-sometimes-failed-in-the-fork).

### Security
- "Run As" account names are looked up with `execFile` and `--`; a name starting with `-` could be read as an option of `id` (CWE-88).
- Daemon HTTP responses carry a sandboxing CSP and `nosniff`, so downloaded files never run in the browser (CWE-79).
- Session token moved out of URLs into the `X-MCSM-Token` header (CWE-598); the panel compares tokens in constant time (CWE-208).
- Panel no longer logs the one-time SSO login token (`instance_exchange_router.ts`) (CWE-532).
- Panel no longer logs the session token on login (CWE-532).
- Panel `/api/overview/upload_assets` accepts only image files (png, jpg, jpeg, gif, webp, ico); upstream stored any extension in the panel's public folder.
- React EULA prompt renders the link as an element instead of upstream's `innerHTML`; the remembered daemon choice in localStorage is shape-checked before use.
- React charts use echarts 6.1.0; echarts 5.x has an XSS advisory (GHSA-fgmj-fm8m-jvvx). Chart tooltips escape all panel data.
- React API client attaches the panel session token only to same-origin requests; upstream also sent it to the daemon on file uploads (CWE-201).
- React instance console: translation strings render through `SafeHtml` instead of `v-html`; the RCON password field is masked; download-from-URL accepts http(s) only; stored tabs and mod-manager settings in localStorage are validated; external links open with `noopener`; editing a schedule no longer loses the original task when the re-create fails.
- Settings API no longer returns `gatewaySecret` or passport secrets.
- React Phase 3: Docker image and container details render as text (upstream used `innerHTML`); market images and links accept only http(s) or same-origin paths; the new-password field on the Users page is masked; the market editor's link import sends no credentials.
- Panel: local market file path confined to `public/upload_files` (CWE-22); uploaded market templates are parsed and size-capped.
- React Phase 4: the plugin card loads its page in a sandboxed frame without `allow-same-origin`, instead of upstream's `innerHTML` plus a script sandbox that handed the page `window` and the logged-in API client (CWE-94, CWE-829). Iframe cards cannot navigate the panel (CWE-1021). Image, carousel and link URLs accept only http(s) or same-origin paths; links open with `noopener,noreferrer`.
- Panel CSP never allows `'unsafe-eval'` (CWE-95).
- Uploaded `.html`, `.htm`, `.svg`, `.xml` and `.js` files under `upload_files` are served as `text/plain` with `nosniff` and a CSP `sandbox`, so they never run as the panel, including files uploaded by older versions (CWE-79, CWE-434).
- Legacy plugins never get the panel's window, cookies or session; panel API access is off by default and, when on, limited to allow-listed read-only GETs with a rate limit (CWE-94, CWE-285, CWE-770).
- React renewal dialog: the code is trimmed, capped at 128 characters and never served from the response cache; the manual-copy dialog renders text, not HTML.
- Panel: Web Admin grant, manage and last-Web-Admin rules (CWE-269); the rate limiter ignores client-supplied forwarding headers (fixes a fork bypass, CWE-348). See SECURITY-LOG for all 2026-10-25 entries.

