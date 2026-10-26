# Panel: Additional Security, Web Admin, dev-tools blocker and tamper check

These features come from the Johnnykins fork. They are set in **Settings > Additional Security** in the React UI, or in `data/SystemConfig/config.json` on the panel. The key names are the fork's, so a fork config file keeps working.

## 1. What it does

| Key | Default | Effect |
|---|---|---|
| `webAdminEnforced` | `false` (`true` on a fresh install) | Only Web Admin/Owner accounts (permission `20`) can use the panel-wide routes: settings, daemons (add, edit, delete), Docker images, user management, instance create/delete and batch actions, the global terminal's files. Plain admins (`10`) keep instance management. |
| `sessionMaxAgeMinutes` | `60` | A login ends this many minutes after it started, or at once when the client IP changes. `0` turns it off; the 24-hour session cookie still applies. |
| `helmet` | `true` | Security headers: Content-Security-Policy, X-Frame-Options `SAMEORIGIN`, X-Content-Type-Options, Referrer-Policy `same-origin`, Cross-Origin-Resource-Policy `same-site`. HSTS is not sent (set it on your TLS front end). |
| `cors` | `false` | CORS allow-list. When on, it replaces the `*` header of `crossDomain`. |
| `origin` | `""` | Comma-separated exact origins for `cors`, e.g. `https://panel.example.com`. Wildcards are refused. |
| `rateLimiter` | `false` | Per-IP limit on `/api/` requests. Over the limit the panel answers `429`. |
| `rateLimitMax` | `20` | Requests allowed per window (1 to 100000). |
| `rateLimitDuration` | `10000` | Window length in milliseconds (1000 to 86400000). |
| `daemonServerIDs` | `[]` | IPs that skip the rate limiter. Plain IPs; the fork's hex "JohnnykinsID" values are still read. |
| `pandorasWall` | `false` | After startup no code can add request handlers to the panel. Applies on the next restart. |
| `devBlocker` | `false` | The web UI closes itself when browser developer tools are detected. |

The **tamper check** has no switch. The build writes `app-hash.txt` and `app_map-hash.txt` next to `app.js`; the panel and the daemon refuse to start when `app.js` or `app.js.map` no longer match.

## 2. How to use it

**Web Admin role.** On a fresh install the first account is a Web Admin and enforcement is on. On an upgraded panel:
1. While no Web Admin exists, any admin may give the role: Users > edit user > Permission "Web Admin/Owner". Give it to yourself first.
2. As that Web Admin, open Settings > Additional Security and set "Enforce Web Admin role" to Enable.

Rules the panel enforces: only Web Admins grant the role or edit or delete a Web Admin; the last Web Admin cannot be demoted or deleted; only a Web Admin can turn enforcement on.

**Tamper check.**
- `npm run build` in `panel/` or `daemon/` writes the hash files. `build.sh` and `build.bat` copy them into `production-code/`.
- Development: `npm run dev` builds first, so it passes. To run without hash files, start with `--dev`; the panel allows this only with at most 1 user and 1 daemon, the daemon only with no instances besides the global one.
- Panel self-update: after applying a package the updater writes fresh hashes for the new `app.js`, because the operator chose that package. A package that ships its own hash files keeps them.

**Rate limiter behind a proxy.** The limiter keys on the client IP the panel sees. Turn on `reverseProxyMode` (Settings > Security) so the proxy's header is used; otherwise every request looks like it comes from the proxy.

## 3. How it is secure

- Route levels are checked on the server (`middleware/permission.ts` with `effectiveLevel()`); the UI only hides pages (NIST AC-3, AC-6; ASVS V4.1).
- Role changes are guarded against privilege escalation: unknown permission numbers are refused, and the Web Admin role is granted only by a Web Admin or during bootstrap (CWE-269).
- The login lifetime is an absolute timeout bound to the login IP (CWE-613, ASVS V3.3).
- The CSP allows scripts only from the panel itself plus the exact inline scripts in `public/index.html`, pinned by SHA-256 (CWE-79 defence in depth, ASVS V14.4).
- All settings values are type- and range-checked; CORS origins must be exact http(s) origins (CWE-942) and allow-list entries must be IPs.
- The fork read `X-Forwarded-For`, `CF-Connecting-IP` and `True-Client-IP` from every request, so a client could claim a whitelisted daemon IP and skip the limiter (CWE-290, CWE-348). This port uses Koa's `ctx.ip`, which honours a proxy header only in reverse-proxy mode.
- SECURITY-WARNING: the dev-tools blocker is a deterrent only. The bundle is public and the API can be called directly.
- SECURITY-WARNING: the tamper check catches accidental or careless edits. Anyone who can write `app.js` can rewrite the hash files too. Protect the install folder with ownership and permissions (NIST SI-7).
- The CSP never allows `'unsafe-eval'`. The shipped React build needs none and carries `<meta name="mcsm-csp" content="strict">`. Serving the old Vue build (which compiles i18n messages with `new Function()`) only works with `helmet` off, and the panel logs a warning at startup.

## 4. Configuration example

```json
{
  "webAdminEnforced": true,
  "sessionMaxAgeMinutes": 120,
  "helmet": true,
  "cors": true,
  "origin": "https://panel.example.com,https://admin.example.com",
  "rateLimiter": true,
  "rateLimitMax": 60,
  "rateLimitDuration": 10000,
  "daemonServerIDs": ["10.0.0.5"],
  "pandorasWall": false,
  "devBlocker": false
}
```

## 5. Differences from the fork

| Fork | This port | Why |
|---|---|---|
| Rate limiter on by default | Off by default | It can lock out daemons and proxies before the operator has set the allow-list. |
| Client IP from forwarded headers, always | `ctx.ip` | Header spoofing bypassed the limiter. |
| PandorasWall compared Symbols that never matched, so it never engaged | Freezes the middleware list after startup | Same intent, working. |
| Tamper check re-checked `panel/production` relative to the working directory and ran an `rmdir` loop every 30 s | Single check of the running bundle's folder, no `rmdir` loop | The loop could only remove an empty folder and never protected anything. |
| disable-devtool also loaded from jsDelivr | Bundled, pinned `disable-devtool@0.3.9`, `@fvilers/disable-react-devtools@1.3.0` | No unpinned third-party script; the CSP blocks it anyway. The library's fallback page (which sends the panel host to a third party) is replaced with `about:blank`. |
| `/api/overview/systemconfig` | Kept, and `devBlocker` also comes with `/api/auth/status` | One request fewer at boot. |

## 6. FAQ

- **The panel will not start: "app.js does not match its build hash".** The bundle changed after the build. Rebuild, or restore the files from your release package.
- **The panel will not start: "app-hash.txt is missing".** The files were copied without the hash files. Copy them from the build output, or rebuild.
- **I locked myself out of Settings.** Edit `data/SystemConfig/config.json`, set `"webAdminEnforced": false`, restart the panel.
- **Browsers on another site get CORS errors.** Add that site's exact origin to `origin`, including scheme and port.
