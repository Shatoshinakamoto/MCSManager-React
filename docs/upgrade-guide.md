# Upgrade guide

How to move an existing MCSManager install to this React port, from either upstream MCSManager
(10.x panel, 4.x daemon) or the Johnnykins fork. Your data folders (`panel/data`, `daemon/data`),
users, instances and saved card layouts carry over unchanged.

> SECURITY: back up `panel/data` and `daemon/data` before upgrading. They hold your users, daemon keys
> and passport secrets, so keep the backup somewhere only administrators can read (NIST CP-9).

## 1. Before you start

1. Stop the panel and every daemon.
2. Back up `panel/data` and `daemon/data`.
3. Note which panel connects to which daemon. Panel and daemon must be upgraded together (see section 4).

## 2. Build and install

`build.sh` (Linux/macOS) or `build.bat` (Windows) now build the React UI in `frontend-react/` instead of
the Vue `frontend/`. The output layout is the same as upstream (`production-code/web`,
`production-code/daemon`), with two differences:

| Change | What to do |
|---|---|
| The UI's sourcemaps go to `production-code/frontend-sourcemaps/`, not into the served `web/public/` | Nothing. Keep that folder off the server unless you want readable stack traces. |
| `app-hash.txt` and `app_map-hash.txt` sit next to each `app.js` (tamper check) | Copy them together with `app.js` and `app.js.map`. The panel and daemon refuse to start if they are missing or do not match. Rebuild instead of patching `app.js` by hand. |

Copy the new `web/` over the old one, keeping `data/`. Docker users rebuild the images; the Dockerfiles call
`build.sh`, so nothing else changes. See [build-production.md](build-production.md).

## 3. Panel settings that behave differently

All of these are in **Settings** in the new UI. Details in
[configuration/panel-additional-security.md](configuration/panel-additional-security.md).

| Setting | Upgraded panel | Fresh install | Notes |
|---|---|---|---|
| Web Admin role enforcement (`webAdminEnforced`) | Off | On | While off, panel-wide pages (settings, daemons, users, Docker images) still accept any admin, so nothing changes on day one. Give yourself the Web Admin/Owner role, then turn enforcement on. |
| Login lifetime (`sessionMaxAgeMinutes`) | 60 minutes | 60 minutes | Sessions also end when the client IP changes. Set `0` to keep upstream's 24-hour cookie only. |
| Security headers (`helmet`) | On | On | X-Frame-Options `SAMEORIGIN`: if you embedded the panel in a page on another site, that stops working. |
| CORS allow-list, rate limiter, PandorasWall, dev-tools blocker | Off | Off | Turn on as needed. Behind a reverse proxy, turn on `reverseProxyMode` before the rate limiter. |

Fork config keys keep their names, so a Johnnykins `config.json` is read as-is.

## 4. Panel and daemon must speak the same passport mode

This port adds a passport check between panel and daemon on top of the daemon key. Both sides read
`johnnykins.passport.mode`, and both must hold the same value, or the daemon shows as offline with
`mode_mismatch` in the logs. See [features/passport-auth.md](features/passport-auth.md).

| You are upgrading from | Set |
|---|---|
| Upstream, panel and daemons all upgraded | Nothing. Both default to `standard` and pair on the first connection. |
| Upstream, some daemons stay on upstream | `mode: "off"` on the panel. An upstream daemon only understands the bare key. Upgrade the daemons later and switch back to `standard`. |
| Upstream panel kept, daemon upgraded | `mode: "off"` on the daemon (`daemon/data/Config/global.json`). |
| The Johnnykins fork | `standard` is recommended. To keep the fork's algorithm, set `"johnnykins-legacy"` on both sides, set `legacy.panelServerAddress` on the daemon, set `lock` to `false` on the daemon once, and restart both. |

To pair a daemon with a different panel later, set its `lock` to `false` and restart it.

Daemon-side gates (`johnnykins.instanceMasterConfig`) default to allowing commands, the file manager and
Docker, so instances keep working. The fork defaulted Docker to off.

## 5. Plugins and uploaded files

Upstream's plugin card injected the plugin's HTML into the panel page. The new plugin card runs it in a
sandboxed frame with no access to the panel's page, cookies or login. See
[features/legacy-plugins.md](features/legacy-plugins.md).

- **Old plugins** (using `window.$axios`, `$theme`, `$onMounted` and so on): open the card in design mode,
  turn on **Old plugin API**, and, only if the plugin needs panel data, **Allow read-only panel data**. The
  plugin can then read the overview, daemon list and instance lists. Anything that writes to the panel no
  longer works by design.
- **Plugins that call `eval` or `new Function`** do not run. The panel never allows `'unsafe-eval'`.
- **Uploaded files**: `.html`, `.htm`, `.svg`, `.xml` and `.js` files in `upload_files` are now served as
  plain text, including ones uploaded by an older version. A card that pointed an iframe straight at such a
  file shows its source; switch it to a plugin card instead.
- The asset upload accepts images and audio (and market templates through the market editor). Other file
  types are refused.

## 6. Scripts and integrations that call the panel API

- The UI sends the session token in the `X-MCSM-Token` header. The panel still accepts `?token=` in the URL,
  so existing scripts keep working, but move them to the header: URLs end up in proxy and browser logs
  (CWE-598).
- API keys (`?apikey=`) are unchanged.
- `/api/overview/systemconfig` and the `devBlocker` / `webAdminEnforced` fields in `/api/auth/status` are new
  and public.
- The settings API no longer returns `gatewaySecret` or passport secrets.
- When Web Admin enforcement is on, an API key belonging to a plain admin loses access to panel-wide routes.

## 7. After the upgrade

1. Start the daemons, then the panel. Check both logs for `TamperCheck` or `mode_mismatch` errors.
2. Log in and check that every daemon is online on the **Daemons** page.
3. Give yourself the Web Admin/Owner role (Users > edit) and turn on enforcement (Settings > Additional
   Security).
4. Open each page that has plugin cards and switch on **Old plugin API** where a card is blank.
5. Optional: run the browser tests against the panel ([commands/frontend-react.md](commands/frontend-react.md)).

## 8. Going back

Stop everything, restore `panel/data` and `daemon/data` from the backup, and reinstall the old build. Passport
pairing data written by this port is ignored by upstream. Layouts saved with new card types show those cards
as unknown in upstream's UI.
