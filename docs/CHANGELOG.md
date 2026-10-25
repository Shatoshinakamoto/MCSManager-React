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

### Changed
- `common`: exports the passport module; adds `seedrandom@3.0.5` (legacy scramble) and `@types/seedrandom@3.0.8`.
