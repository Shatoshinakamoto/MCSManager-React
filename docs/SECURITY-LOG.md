# Security log

Entries follow the template in the project's secure development standards. Newest first.

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
