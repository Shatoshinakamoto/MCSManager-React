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

### Fixed
- Intermittent daemon connection failures from the fork's auth: passport list overwrite and eviction, passport types 1-3 never verifying, daemon locking itself after a failed sync, missing verification timeout, ban DB startup race. Details in [features/passport-auth.md](features/passport-auth.md#why-connections-sometimes-failed-in-the-fork).

### Security
- Panel no longer logs the session token on login (CWE-532).
- Panel `/api/overview/upload_assets` accepts only image files (png, jpg, jpeg, gif, webp, ico); upstream stored any extension in the panel's public folder.
- React EULA prompt renders the link as an element instead of upstream's `innerHTML`; the remembered daemon choice in localStorage is shape-checked before use.
- React charts use echarts 6.1.0; echarts 5.x has an XSS advisory (GHSA-fgmj-fm8m-jvvx). Chart tooltips escape all panel data.
- Settings API no longer returns `gatewaySecret` or passport secrets. See SECURITY-LOG for all 2026-10-25 entries.

### Changed
- `common`: exports the passport module; adds `seedrandom@3.0.5` (legacy scramble) and `@types/seedrandom@3.0.8`.
