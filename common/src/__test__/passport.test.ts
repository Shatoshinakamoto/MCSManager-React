/**
 * Tests for both passport modes, including malicious inputs: the regex
 * wildcard bypass from the 10.2.x fork, replay, reflection, tampering and
 * malformed fields (CWE-185, CWE-287, CWE-294, CWE-20).
 */
import { describe, expect, it } from "vitest";
import { legacyPassport as L, parsePassportMode, standardPassport as S } from "../passport";

const keys = { panel: S.generateSecretPair(), daemon: S.generateSecretPair() };
const ids = { panelId: "panel-1", daemonId: "daemon-1" };

describe("standard mode", () => {
  const daemonNonce = S.generateNonce();
  const panelNonce = S.generateNonce();
  const proof = S.createProof(keys, { role: "panel", ...ids, daemonNonce, panelNonce });
  const opts = { expectedRole: "panel" as const, ...ids, expectedNonce: { daemonNonce } };

  it("accepts a valid proof", () => expect(S.verifyProof(keys, proof, opts)).toBe(true));
  it("rejects a proof made with only one side's secret", () => {
    const other = { panel: keys.panel, daemon: S.generateSecretPair() };
    expect(S.verifyProof(other, proof, opts)).toBe(false);
  });
  it("rejects tampered fields", () => {
    expect(S.verifyProof(keys, { ...proof, daemonId: "daemon-2" }, { ...opts, daemonId: "daemon-2" })).toBe(false);
    expect(S.verifyProof(keys, { ...proof, proof: S.generateNonce() }, opts)).toBe(false);
  });
  it("rejects reflection (panel proof replayed as daemon proof)", () => {
    expect(S.verifyProof(keys, { ...proof, role: "daemon" }, { ...opts, expectedRole: "daemon" })).toBe(false);
  });
  it("rejects stale proofs", () => {
    expect(S.verifyProof(keys, proof, { ...opts, now: proof.timestamp + S.DEFAULT_MAX_AGE_MS + 1 })).toBe(false);
  });
  it("rejects replay with a nonce cache", () => {
    const cache = new S.NonceCache();
    expect(S.verifyProof(keys, proof, { ...opts, nonceCache: cache })).toBe(true);
    expect(S.verifyProof(keys, proof, { ...opts, nonceCache: cache })).toBe(false);
  });
  it("rejects regex wildcards and garbage without throwing", () => {
    expect(S.verifyProof(keys, { ...proof, proof: ".*" }, opts)).toBe(false);
    expect(S.verifyProof(keys, null as never, opts)).toBe(false);
  });
});

describe("johnnykins-legacy mode", () => {
  const args = ["daemon-key", "p1", "s1", "p2", "s2", 3] as const;
  it("is deterministic and verifies", () => {
    const tok = new L.JohnsNonAsymmSha256Wrapper(...args).toString();
    expect(new L.JohnsNonAsymmSha256Wrapper(...args).toString()).toBe(tok);
    expect(L.verifyJohnsAsymmSha256Wrapper(tok, ...args)).toBe(true);
  });
  it("closes the original regex bypass", () => {
    expect(L.verifyJohnsAsymmSha256Wrapper(".*", ...args)).toBe(false);
    const tok = new L.JohnsNonAsymmSha256Wrapper(...args).toString();
    expect(L.verifyJohnsAsymmSha256Wrapper(tok.slice(1), ...args)).toBe(false);
    expect(L.verifyJohnsAsymmSha256Wrapper("x" + tok, ...args)).toBe(false);
  });
  it("depends on both secret pairs", () => {
    const tok = new L.JohnsNonAsymmSha256Wrapper(...args).toString();
    expect(L.verifyJohnsAsymmSha256Wrapper(tok, "daemon-key", "p1", "s1", "p2", "WRONG", 3)).toBe(false);
  });
  it("never yields an empty token", () => {
    expect(new L.JohnsNonAsymmSha256Wrapper("", "", "", "", "", 1).toString().length).toBeGreaterThan(0);
  });
  it("matches passports field by field in constant time", () => {
    const stored = { key: "k", tokenv2: L.createTokenV2(2), tokenv3: L.createTokenV3(2), uuid: "u" };
    expect(L.matchLegacyPassport(stored, { ...stored }, 3)).toBe(true);
    expect(L.matchLegacyPassport(stored, { ...stored, tokenv2: ".*" }, 3)).toBe(false);
    expect(L.matchLegacyPassport(stored, { key: "k", uuid: "u" }, 3)).toBe(false);
  });
  it("keeps full randomness in tokens", () => {
    const a = L.createTokenV2(1);
    expect(Buffer.from(a, "hex").toString()).not.toContain("�");
    expect(L.createTokenV2(1)).not.toBe(a);
  });
  it("caps entropy at 10", () => {
    for (let i = 0; i < 50; i++) expect(L.createTokenEntropy(99)).toBeLessThanOrEqual(10);
  });
});

describe("mode parsing", () => {
  it("fails closed to standard", () => {
    expect(parsePassportMode("johnnykins-legacy")).toBe("johnnykins-legacy");
    expect(parsePassportMode("anything")).toBe("standard");
    expect(parsePassportMode(undefined)).toBe("standard");
  });
});
