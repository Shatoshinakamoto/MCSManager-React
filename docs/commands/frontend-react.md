# `frontend-react` npm scripts

Run from `frontend-react/`. No root privileges needed.

| Script | Synopsis | What it does |
|---|---|---|
| `dev` | `npm run dev [-- --port N]` | Vite dev server with HMR, proxies `/api`, `/socket.io`, upload/download routes to the panel |
| `build` | `npm run build` | `tsc --noEmit` type-check, then production bundle to `dist/` |
| `type-check` | `npm run type-check` | Type-check only |
| `test` | `npm test` | Vitest unit and security tests (jsdom) |
| `preview` | `npm run preview` | Serve `dist/` locally |
| `audit` | `npm run audit` | `npm audit --omit=dev` |

Environment variables:

| Variable | Default | Effect | Security note |
|---|---|---|---|
| `MCSM_PANEL_URL` | `http://localhost:23333` | Panel the dev proxy targets | Use https for remote panels |
| `VITE_DEV_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Host headers the dev server accepts | Do not set to all hosts; that re-enables DNS rebinding |

Useful Vite flags: `--host` (already set; listens on all interfaces, so keep the dev server off untrusted networks), `--port`, `--strictPort`. Full list: https://vite.dev/guide/cli

Exit codes: 0 on success, non-zero on type, test or build failure.
