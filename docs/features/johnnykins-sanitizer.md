# Johnnykins command sanitizer

Ported from the fork's `sanitize.ts`, `java_sanitize.ts` and `universal_sanitize.ts`. Code:
`common/src/security/command_sanitizer.ts` (pure, unit tested) and
`daemon/src/service/johnnykins/command_guard.ts` (applies it on the daemon).

## Profiles

| Profile | Used for | What it does |
|---|---|---|
| `minecraft` | `minecraft/*` instances when `mcSanitizer` is on | Strips control characters, ANSI escapes and emoji. Keeps quotes so JSON commands work. Applies your `sanitizerBlacklist`. |
| `shell` | other instances whose start command is a shell | As above, plus the built-in shell blacklist. |
| `universal` | every other instance when `sanitizer` is on | As `minecraft`. |

## Differences from the fork

- Blacklist entries match whole command words and reject the command; the fork deleted them as
  substrings, so "say ship it" lost "ip".
- Your entries are literal text, not regular expressions (no ReDoS, no crashes on a bad entry).
- Quote and escape removal is off by default (`stripEscapes`) because it broke `/tellraw`.
- The full command text is never logged; only the instance id and the rule that matched.

Settings: [configuration/daemon-johnnykins.md](../configuration/daemon-johnnykins.md#johnnykinssanitizer).
