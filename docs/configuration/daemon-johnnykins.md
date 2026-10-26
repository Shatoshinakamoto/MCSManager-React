# Daemon `johnnykins` settings

File: `daemon/data/Config/global.json`, key `johnnykins`. Ported from the Johnnykins-MCSManager fork's
`johnnykins`, `instanceMasterConfig`, ban and passport options. Restart the daemon after editing.

> SECURITY: this section holds secret pairs. The daemon keeps the file at mode 0700. Never paste it into
> issues or chat, and never commit it.

## `johnnykins.passport`

| Key | Default | Fork name | Meaning |
|---|---|---|---|
| `mode` | `"standard"` | `panelPassportType` (partly) | `standard` (HMAC-SHA256 challenge-response), `johnnykins-legacy` (original wrapper plus verification call to the panel), or `off` (upstream: daemon key only). Must match the panel's mode. Unknown values fall back to `standard`. |
| `daemonId` | random UUID | – | This daemon's id in the passport. |
| `daemon.secret` / `daemon.salt` | random (32 / 16 bytes) | `johnnykins.sha256` | This daemon's secret pair. |
| `panelId` | `""` | `panelServerIDs` | The paired panel. Filled in by pairing. |
| `panel.secret` / `panel.salt` | `""` | `johnnykins.panelsSha256` | The paired panel's pair. Filled in by pairing. |
| `lock` | `false` | `johnnykins.lock` | Set to `true` by the first pairing. While `true` only `panelId` can connect and the daemon never hands out its pair again. Set to `false` and restart to pair a new panel. |
| `maxAgeMs` | `300000` | – | Accepted proof age. The single-use nonce gives freshness; this mostly absorbs clock skew between hosts. |
| `challengeTtlMs` | `30000` | – | How long a challenge nonce stays valid. |
| `legacy.passportType` | `4` | `panelPassportType` | Passport type 1-4 for `johnnykins-legacy`. Must match the panel. |
| `legacy.panelServerAddress` | `"http://localhost:23333"` | `panelServerAddress` | Where the daemon calls `/api/auth/daemon-verifications`. Use `https://` for a remote panel. |
| `legacy.verifyTimeoutMs` | `4000` | – | Timeout for that call. Keep it below the panel's `authTimeoutMs`. |
| `legacy.sha256` | random | `johnnykins.sha256` | This daemon's legacy pair. |
| `legacy.panelsSha256` | `""` | `johnnykins.panelsSha256` | The panel's legacy pair, filled in by pairing. |

## `johnnykins.ban`

| Key | Default | Fork name | Meaning |
|---|---|---|---|
| `enabled` | `true` | – | Ban addresses after repeated failed daemon logins. |
| `maxFailedLoginsToBan` | `5` | `maxFailedLoginsToBan` (3) | Failed logins (wrong key or bad proof) before a ban. Mode or pairing mismatches don't count. |
| `banTime` | `60` | `banTime` | Minutes. `0` means permanent. Bans always expire otherwise (fork: `forgiveBans`). |
| `whitelisted` | `["127.0.0.1", "::1"]` | `whitelisted` | Never banned. |
| `trustedProxies` | `[]` | – | Only if the daemon is behind your own reverse proxy: list its addresses so `X-Forwarded-For` is used. Empty means forwarding headers are ignored (they are client-controlled). |

Bans are saved to `daemon/data/Security/bans.json` (mode 0600).

## `johnnykins.sanitizer`

Applied to console commands from the panel (`instance/command`, `stream/input`). Raw terminal keystrokes
(`stream/write`) are only gated, not sanitized.

| Key | Default | Fork name | Meaning |
|---|---|---|---|
| `sanitizer` | `true` | `sanitizer` | Sanitize non-Minecraft instances. |
| `mcSanitizer` | `true` | `mcSanitizer` | Sanitize `minecraft/*` instances with the Minecraft profile. |
| `stripControlChars` | `true` | (part of `sanitizer`) | Remove control characters and ANSI escape sequences. |
| `stripEmoji` | `true` | (part of `sanitizer`) | Remove emoji. |
| `stripEscapes` | `false` | (part of `sanitizer`) | Fork behaviour: remove backslash escapes and quoted text. Breaks `/tellraw` and other JSON commands. |
| `sanitizerBuiltInBlacklist` | `true` | `sanitizerBuiltInBlacklist` | Reject shell commands such as `rm`, `sudo`, `bash`, `curl` and paths with `../`. Applies only to instances whose start command is a shell (bash, sh, cmd, PowerShell...). |
| `sanitizerConfigurableBlacklist` | `false` | `sanitizerConfigurableBlacklist` | Turn on `sanitizerBlacklist`. |
| `sanitizerBlacklist` | `[]` | `sanitizerBlacklist` | Your own entries, both profiles. A single word matches the command word (`op` blocks `op Steve`, not `deop`). An entry with a space or `/` matches as literal text. Entries are never treated as regular expressions. |
| `maxLength` | `32767` | – | Longer commands are rejected. |

Blocked commands are refused with an error, not silently changed. A blacklist is defence in depth: run
instances as an unprivileged user or in Docker, with SELinux enforcing.

## `johnnykins.instanceMasterConfig`

Daemon-side switches the panel cannot override.

| Key | Default | Meaning |
|---|---|---|
| `canSendCommands` | `true` | Allow console input from the panel. |
| `canFileManager` | `true` | Allow the file manager (`file/*` events). |
| `docker` | `true` | Allow Docker instances to start. (The fork defaulted this to `false`; it is `true` here to keep upstream Docker support working.) |
| `ptyAccess` | `true` | Allow the pseudo-terminal (PTY) mode. Off: instances that ask for it start in plain pipe mode instead, with a note in the console. (Fork default `false`, where the start was refused.) |
| `openFrpAccess` | `true` | Allow OpenFRP tunnels, which download and run `frpc`. Off: the tunnel is skipped with a note in the console. (Fork default `false`.) |
| `mcStatus` | `true` | Allow the Minecraft status ping (players, version, MOTD) every 60 s. |

The fork's `dockerPty` switch was never read by its code and is not ported.

## `johnnykins.http`

Hardening for the daemon's HTTP server, which carries file uploads and downloads (each needs a one-time
passport from the panel). Ported from the fork's daemon `cors`, `origin`/`origins`, koa-helmet and
koa-ratelimit settings; implemented without new packages in `daemon/src/service/johnnykins/http_security.ts`.

| Key | Default | Fork name | Meaning |
|---|---|---|---|
| `securityHeaders` | `true` | (helmet) | Sends `Content-Security-Policy: default-src 'none'; …; sandbox`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and drops `X-Power-by`. A downloaded HTML or SVG file opened in the browser runs nothing. The daemon's own information page gets a CSP that allows only its inline styles and its hash-pinned inline script. |
| `cors` | `false` | `cors` | Off: upstream's `Access-Control-Allow-Origin: *`. On: only the origins in `origins` get a CORS header. |
| `origins` | `[]` | `origin`, `origins` | Exact origins for `cors`, e.g. `["https://panel.example.com"]`. `*` is ignored. Must include the address users open the panel at, or uploads from the browser fail. |
| `rateLimiter` | `false` | (koa-ratelimit, on) | Per-IP request limit. Over the limit the daemon answers `429`. Off by default because the fork's 20 requests per 10 s can cut off large uploads and busy panels. |
| `rateLimitMax` | `120` | `max` (20) | Requests per window (1 to 100000). |
| `rateLimitDurationMs` | `10000` | `duration` | Window length (1000 to 86400000 ms). |

The limiter keys on the socket address; `X-Forwarded-For` is used only when the peer is listed in
`johnnykins.ban.trustedProxies`. The fork keyed on client-supplied Cloudflare and forwarding headers, which let a
client pick a new identity per request.

## `johnnykins.pandorasWall`

| Key | Default | Fork name | Meaning |
|---|---|---|---|
| `pandorasWall` | `false` | `pandoraswall` | After startup no code can add HTTP middleware to the daemon. The fork's version compared two `Symbol()` values, which never match, so it never engaged; this one freezes the middleware list. |

## `johnnykins.runAs`

Limits for "Run As" (start an instance as another OS account). Switching accounts needs the daemon to run as
root on Linux or macOS. Full description: [features/run-as-user.md](../features/run-as-user.md); setup:
[install-guide.md](../install-guide.md) method A.

| Key | Default | Meaning |
|---|---|---|
| `defaultUser` | `""` | Account for instances whose "Run As" is empty. `""` keeps upstream behaviour: they run as the daemon's own account, which is root on a root daemon (the daemon logs a warning). |
| `allowedUsers` | `[]` | The only accounts "Run As" may name. Empty means any account except root. Shown as a list in the instance settings. |
| `allowRoot` | `false` | Allow "Run As" to name root (uid 0). Never applies to linked OS accounts, which can never be root. |
| `handOverPaths` | `[]` | Absolute folders, besides the instance data folder, whose sub-folders may be handed to an OS account linked through the panel. A drive or file system root is ignored. A linked instance outside all of them is accepted only when its folder already belongs to the account. ([details](../features/os-user-accounts.md#6-settings)) |

`allowedUsers` also limits the accounts panel users can be linked to ([features/os-user-accounts.md](../features/os-user-accounts.md)).

Not used for Docker instances, where "Run As" sets the container user.
