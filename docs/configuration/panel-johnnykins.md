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

## Editing in the web UI
In the React UI, **Settings → Daemon Passport** edits `mode`, `authTimeoutMs` and the `legacy` options (passport type, token entropy, maximum entropy rounds, passport lifetime). Secrets never reach the browser and cannot be edited there. Changing the mode asks for confirmation, because every daemon whose `johnnykins.passport.mode` differs disconnects until it is changed too. The panel clamps every value again on save (`settings_router.ts`).

Daemon-side options (ban list, sanitizer, file manager and Docker gates) are edited in each daemon's `data/Config/global.json`; see [daemon-johnnykins.md](daemon-johnnykins.md).

## Per-node pairing (`panel/data/RemoteServiceConfig/<uuid>.json`, key `passport`)

Filled in automatically by the first successful connection: the daemon's id, its standard pair and its
legacy pair. Not returned by any node API. To pair again, set `lock` to `false` on the daemon and restart
it; the panel notices and re-pairs by itself.
