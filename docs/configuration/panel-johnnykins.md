# Panel `johnnykins` settings

File: `panel/data/SystemConfig/config.json`, key `johnnykins`. The switches (not the secrets) can also be
changed through `PUT /api/overview/setting`. Restart the panel after editing the file by hand.

> SECURITY: the secrets in this section are never returned by the settings API.

## `johnnykins.passport`

| Key | Default | Fork name | Meaning |
|---|---|---|---|
| `mode` | `"standard"` | `remoteService.passportType` (partly) | `standard`, `johnnykins-legacy` or `off`. Must match every daemon's `johnnykins.passport.mode`. |
| `panel.secret` / `panel.salt` | generated on first start | `panelsSha256` | The panel's standard-mode pair. |
| `authTimeoutMs` | `8000` | `remoteService.authTimeout` | How long the panel waits for each handshake reply (2000-60000). |
| `legacy.passportType` | `4` | `remoteService.passportType` | Passport type 1-4. Must match the daemon. |
| `legacy.tokenEntropy` | `true` | `remoteService.tokenEntropy` | Use a random entropy multiplier for passport tokens. |
| `legacy.maxEntropy` | `3` | – | Upper bound for that multiplier (1-10). |
| `legacy.panelsSha256` | generated on first start | `panelsSha256` | The panel's legacy pair. |
| `legacy.passportTtlSeconds` | `60` | – | How long an issued passport waits for the daemon's verification call. |

## `johnnykins.remoteService`

Daemon connection timing, from the fork's `remoteService.heartbeatInterval` and `remoteService.connectionTimeout`.
The defaults are upstream's values. Changes apply without a restart.

| Key | Default | Fork name | Meaning |
|---|---|---|---|
| `heartbeatIntervalMs` | `60000` | `remoteService.heartbeatInterval` (30000) | How often the panel retries daemons that are offline (5000-600000). |
| `localDaemonRetryMs` | `5000` | `remoteService.connectionTimeout` (60000) | On a panel with no daemons, how often it looks for a daemon on the same machine (1000-600000). |

## Editing in the web UI
In the React UI, **Settings → Daemon Passport** edits `mode`, `authTimeoutMs`, the two `remoteService` intervals and the `legacy` options (passport type, token entropy, maximum entropy rounds, passport lifetime). Secrets never reach the browser and cannot be edited there. Changing the mode asks for confirmation, because every daemon whose `johnnykins.passport.mode` differs disconnects until it is changed too. The panel clamps every value again on save (`settings_router.ts`).

Daemon-side options (ban list, sanitizer, file manager and Docker gates) are edited in each daemon's `data/Config/global.json`; see [daemon-johnnykins.md](daemon-johnnykins.md).

## Per-node pairing (`panel/data/RemoteServiceConfig/<uuid>.json`, key `passport`)

Filled in automatically by the first successful connection: the daemon's id, its standard pair and its
legacy pair. Not returned by any node API. To pair again, set `lock` to `false` on the daemon and restart
it; the panel notices and re-pairs by itself.
