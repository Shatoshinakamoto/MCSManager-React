# `frontend-react` npm scripts

Run from `frontend-react/`. No root privileges needed.

| Script | Synopsis | What it does |
|---|---|---|
| `dev` | `npm run dev [-- --port N]` | Vite dev server with HMR, proxies `/api`, `/socket.io`, upload/download routes to the panel |
| `build` | `npm run build` | `tsc --noEmit` type-check, then production bundle to `dist/` |
| `type-check` | `npm run type-check` | Type-check only |
| `test` | `npm test` | Vitest unit and security tests (jsdom) |
| `test:e2e` | `npm run test:e2e [-- --headed] [-- -g name]` | Playwright browser tests in `e2e/` against a running panel with the built UI |
| `preview` | `npm run preview` | Serve `dist/` locally |
| `audit` | `npm run audit` | `npm audit --omit=dev` |

Environment variables:

| Variable | Default | Effect | Security note |
|---|---|---|---|
| `MCSM_PANEL_URL` | `http://localhost:23333` | Panel the dev proxy targets | Use https for remote panels |
| `VITE_DEV_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Host headers the dev server accepts | Do not set to all hosts; that re-enables DNS rebinding |
| `MCSM_E2E_URL` | `http://localhost:23333` | Panel the browser tests open | Point it at a test panel, never production |
| `MCSM_E2E_USER` | none | Admin account for the logged-in tests; without it those tests are skipped | Use a throwaway account |
| `MCSM_E2E_PASSWORD` | none | Password for that account | SECURITY: pass it through the environment only; never commit it or put it on the command line where shell history keeps it |

**Browser tests.** `test:e2e` needs Chromium for Playwright (`npx playwright install chromium` once) and a panel serving this UI (`npm run build`, then copy `dist/` into the panel's `public/`). The security specs (CSP without eval, sandboxed plugin host, no sourcemaps) run without an account. The smoke specs log in, open every main page, check that no page error appears and the session token never shows in a URL, and open design mode. The real-scenario spec (`e2e/full.spec.ts`) needs a connected Linux or macOS daemon: it creates an instance named `e2e-<time>` running `cat`, opens every route, starts it, sends a console line and reads it back, fills the start command with the Command Helper, opens every Instance Settings tab (then cancels), creates a file and checks the file manager lists it, and deletes the instance with its files. It fails on page errors, unexpected console errors and 5xx answers; without a Docker engine on the daemon host the Docker image pages' 500s are expected and allowed. To test the dev server the way you run it, start `npm run dev` and set `MCSM_E2E_URL=http://localhost:5173`; the panel header checks are skipped there. Failures leave a trace and screenshot in `test-results/`. CI runs the same suite in `.github/workflows/e2e.yml` on a fresh panel with a random one-time admin password.

Useful Vite flags: `--host` (already set; listens on all interfaces, so keep the dev server off untrusted networks), `--port`, `--strictPort`. Full list: https://vite.dev/guide/cli

Exit codes: 0 on success, non-zero on type, test or build failure.

## Root scripts (repository root)

| Script | What it does |
|---|---|
| `npm run dev` | Daemon, panel and the React UI dev server together |
| `npm run frontend` | React UI dev server only |
| `npm run frontend:vue` | Upstream Vue UI dev server, for side-by-side parity checks only |
| `npm test` | Panel, daemon and React UI unit tests |
| `./build.sh` / `build.bat` | Production build into `production-code/`; the React UI goes to `web/public/`, its sourcemaps to `frontend-sourcemaps/` |
