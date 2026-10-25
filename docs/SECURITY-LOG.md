# Security log

Entries follow the template in the project's secure development standards. Newest first.

## 2026-10-25 - Upstream: any file type accepted by the asset upload (fixed in port)
- **Type:** patch
- **CVE / CWE / advisory:** none; CWE-434, CWE-79
- **Severity:** not CVSS-scored; medium by assessment (admin-only endpoint, but an uploaded .html or .svg is served from the panel's own origin and runs script there, for example against other admins who open the link).
- **Affected:** upstream `panel/src/app/routers/settings_router.ts` `POST /upload_assets`.
- **What changed:** extension allow-list (png, jpg, jpeg, gif, webp, ico); the saved name keeps only the lower-cased allowed extension. The React upload dialog sets the same `accept` list.
- **Why it is secure now:** files that browsers would render as active content can no longer be placed in `public/upload_files` (OWASP File Upload Cheat Sheet). SVG is excluded on purpose because it can carry script.
- **Verification:** live test 2026-10-25: `x.html` refused, `x.png` accepted (`/tmp` repro script, not committed).

## 2026-10-25 - Upstream: login session token written to the panel log (fixed in port)
- **Type:** patch
- **CVE / CWE / advisory:** none; CWE-532
- **Severity:** not CVSS-scored; medium by assessment (anyone who can read the panel log or its shipped copies can reuse a live session's token together with its cookie).
- **Affected:** upstream `panel/src/app/service/passport_service.ts` `login()` (`[LOGIN] Token: ...`).
- **What changed:** the line is removed; the login event still records user and IP.
- **Why it is secure now:** bearer values are not logged (NIST AU-9, OWASP Logging Cheat Sheet).
- **Verification:** log in, then `grep -c "Token:" panel/production/logs/*.log` stays at the pre-login count.

## 2026-10-25 - React charts: echarts version choice (avoided)
- **Type:** dependency
- **CVE / CWE / advisory:** GHSA-fgmj-fm8m-jvvx (echarts XSS, reported by npm audit for 5.x); CWE-79
- **Severity:** npm audit "moderate"; CVSS/EPSS/KEV not looked up.
- **Affected:** would have affected `frontend-react` if it used echarts 5.6.0 like upstream `frontend/`.
- **What changed:** `frontend-react` pins `echarts@6.1.0`. Tooltip formatters HTML-escape every value from the panel (`src/hooks/useOverviewChart.ts`).
- **Why it is secure now:** patched version plus output encoding (ASVS V5.3.3). The upstream Vue UI still uses 5.x until cutover.
- **Verification:** `cd frontend-react && npm audit` (0 vulnerabilities, 2026-10-25).

## 2026-10-25 - Daemon ban list keyed on spoofable headers (fixed in port)
- **Type:** patch
- **CVE / CWE / advisory:** none; CWE-290, CWE-348, CWE-307
- **Severity:** not CVSS-scored; high by assessment (unlimited guessing of the daemon key by rotating headers).
- **Affected:** fork `daemon/src/routers/auth_router.ts` `getIpAddress()` / `banDB`.
- **What changed:** `daemon/src/service/johnnykins/ban_list.ts` keys bans on the socket address; `X-Forwarded-For` is read only when the peer is in `johnnykins.ban.trustedProxies`. Bans carry explicit expiry; success resets the count.
- **Why it is secure now:** the ban key can't be chosen by the client (NIST AC-7).
- **Verification:** live test 2026-10-25: wrong key refused with `bad_key`; ban list code reviewed.

## 2026-10-25 - Legacy passport store overwrite and replay (fixed in port)
- **Type:** patch
- **CVE / CWE / advisory:** none; CWE-294, CWE-664
- **Severity:** not CVSS-scored; medium by assessment (availability: daemons failed to connect intermittently; passports replayable for 5 minutes).
- **Affected:** fork `panel/src/app/common/johnnykins.ts` `LimitedLRUArray`, `RemotePassports`.
- **What changed:** `LegacyPassportStore` in `common/src/passport/legacy.ts`: unique ids, bound 256, 60 s TTL, single-use `take()`, constant-time matching across all entries.
- **Why it is secure now:** a passport can be used once and can't be overwritten by another daemon's.
- **Verification:** `cd common && npx vitest run src/__test__/johnnykins.test.ts` (11 passed); live test 6/6 legacy reconnects.

## 2026-10-25 - Passport secrets in logs and settings API (fixed in port)
- **Type:** hardening
- **CVE / CWE / advisory:** none; CWE-532, CWE-200
- **Severity:** not CVSS-scored; medium by assessment.
- **Affected:** fork logged every passport (`Passport Answer:`) and `Data recieved on auth:`; upstream `GET /api/overview/setting` returned `gatewaySecret`.
- **What changed:** nothing secret is logged by the new handshake; the settings API strips `gatewaySecret` and all `johnnykins` secrets; node APIs never return the per-node pairing.
- **Verification:** `remote_services_list` returned only `uuid, ip, port, prefix, available, remarks` in the live test.

## 2026-10-25 - Command sanitizer rewrite (fixed in port)
- **Type:** hardening
- **CVE / CWE / advisory:** none; CWE-1333, CWE-185, CWE-150, CWE-532
- **Severity:** low by assessment.
- **Affected:** fork `daemon/src/entity/commands/*sanitize.ts`.
- **What changed:** literal matching instead of `new RegExp(entry)`, reject instead of silent substring removal, shell blacklist only for shell instances, no command text in logs.
- **Why it is secure now:** config entries can't cause ReDoS or crashes; behaviour is predictable. Still defence in depth only (see the feature page).
- **Verification:** `johnnykins.test.ts` sanitizer cases; daemon integration test for interactive stdin passes.

## 2026-10-25 - Upstream: TLS verification disabled for wss daemons (open)
- **Type:** accepted risk (upstream, not changed yet)
- **CVE / CWE / advisory:** none; CWE-295
- **Severity:** not CVSS-scored; medium by assessment.
- **Affected:** upstream `panel/src/app/entity/entity_interface.ts` `connectOpts.rejectUnauthorized: false`.
- **What changed:** nothing yet. Changing it breaks daemons that use self-signed certificates. TODO(security): add a per-node CA/fingerprint setting and default to verification on.
- **Mitigation:** standard passport mode authenticates the daemon with its proof, so a man in the middle can't pass as the daemon after pairing.

## 2026-10-25 - Legacy passport: regex token comparison auth bypass (fixed in port)
- **Type:** patch
- **CVE / CWE / advisory:** none (project-specific); CWE-185, CWE-287, CWE-1333, CWE-208
- **Severity:** not CVSS-scored. Critical by assessment: unauthenticated callers of the fork's `/api/auth/daemon-verifications` could pass verification with a header value of `.*`.
- **Affected:** Johnnykins-MCSManager fork (panel 10.2.1 base): `panel/src/app.ts` (`String(obj.key).match(String(header))`), `johnnykins.ts` `verifyJohnsAsymmSha256Wrapper` (`token.match(expected)`).
- **What changed:** the ported `common/src/passport/legacy.ts` compares every passport field with `crypto.timingSafeEqual` on equal-length buffers (`safeEqual`, `matchLegacyPassport`, `verifyJohnsAsymmSha256Wrapper`).
- **Why it is secure now:** exact constant-time comparison; no attacker-controlled regular expressions (OWASP ASVS V2.9, CWE-185/208).
- **Verification:** `cd common && npx vitest run src/__test__/passport.test.ts` (15 passed), including `.*`, prefix and suffix bypass attempts.

## 2026-10-25 - Legacy passport: weak randomness (fixed in port)
- **Type:** hardening
- **CVE / CWE / advisory:** none; CWE-338, CWE-331
- **Severity:** not CVSS-scored; medium by assessment.
- **Affected:** fork `customToken.ts` (Math.random shuffle, modulo bias), `entropyTokenCreation` (Math.random), `tokenV2`/`tokenV3` (`randomBytes(n).toString("utf8")` replaces invalid bytes with U+FFFD).
- **What changed:** `crypto.randomInt` for multipliers and symbol choice; `base64url` encoding for random bytes.
- **Why it is secure now:** CSPRNG only, full entropy retained (NIST SP 800-90A via OpenSSL, CWE-338).
- **Verification:** passport tests "keeps full randomness in tokens", "caps entropy at 10".

## 2026-10-25 - Legacy passport scramble layers (accepted risk, documented)
- **Type:** accepted risk
- **CVE / CWE / advisory:** none; relates to CWE-327 (non-approved construction)
- **Severity:** low; HMAC-SHA256 underneath remains the security boundary.
- **Affected:** `common/src/passport/legacy.ts` `JohnsNonAsymmSha256Wrapper`.
- **What changed:** kept at the owner's request as the `johnnykins-legacy` mode. `standard` mode (HKDF + HMAC-SHA256 challenge-response) is the default.
- **Why it is acceptable:** the scramble is a keyed deterministic permutation on top of HMAC outputs; it does not weaken HMAC but adds no approved strength. Use `standard` where FIPS 140-3 / NIST SC-13 applies.
- **Verification:** n/a (design decision).

## 2026-10-25 - React UI hardening relative to upstream Vue UI
- **Type:** hardening
- **CVE / CWE / advisory:** none; CWE-79, CWE-350, CWE-540
- **Severity:** low to medium by assessment.
- **Affected:** `frontend-react/`.
- **What changed:** no inline scripts or inline event handlers in `index.html` (enables CSP without `'unsafe-inline'`); DOMPurify allow-list plus URL scheme filter and `rel="noopener noreferrer"` for admin Markdown; escaped, scheme-checked background image URLs; dev server `allowedHosts` limited to localhost (upstream: any host); production sourcemaps `hidden`; layout JSON validated before use; only registered widget types render.
- **Why it is secure now:** ASVS V5.3.3 output encoding, V14.4.3 CSP readiness; DNS-rebinding protection for the dev server.
- **Verification:** `cd frontend-react && npm test` (15 passed), `npm audit` (0 vulnerabilities, 2026-10-25).

## 2026-10-25 - Known vulnerable transitive dependencies in upstream `common` (open)
- **Type:** accepted risk (pending upstream sync)
- **CVE / CWE / advisory:** GHSA-cc8f-xg8v-72m3, GHSA-4c3q-x735-j3r5 (compressing), GHSA-pxg6-pf52-xh8x (cookie), GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh (lodash), plus socket.io-parser and ws advisories reported by npm audit.
- **Severity:** npm audit reports "high"; CVSS/EPSS/KEV not yet looked up.
- **Affected:** `common/` dependency ranges inherited from upstream.
- **What changed:** nothing yet. Tracked for the next dependency pass (`npm audit fix` in `common`, then panel/daemon re-test).
- **Verification:** `cd common && npm audit --omit=dev` (2026-10-25).
