/**
 * Tests for the Johnnykins port: legacy passport store (the intermittent
 * connection bug), shared legacy fingerprints, the standard handshake round
 * trip, and the command sanitizer.
 */
import { describe, expect, it } from "vitest";
import { legacyPassport, standardPassport } from "../passport";
import {
  DEFAULT_SANITIZER_OPTIONS,
  commandWords,
  normalizeSanitizerOptions,
  profileFor,
  sanitizeCommand
} from "../security/command_sanitizer";

const pairs = {
  panel: { password: "panel-pw", salt: "panel-salt" },
  daemon: { password: "daemon-pw", salt: "daemon-salt" }
};

describe("LegacyPassportStore", () => {
  const mk = (n: number) => legacyPassport.fingerprintPassport(legacyPassport.createLegacyPassport(4, "key", `node${n}`), 4, pairs);

  it("keeps every live passport when an older one expires (fork overwrote one)", () => {
    const store = new legacyPassport.LegacyPassportStore(5 * 60_000, 256);
    const a = mk(1), b = mk(2), c = mk(3), a2 = mk(4);
    store.add(4, a, 0);
    store.add(4, b, 1000);
    store.add(4, c, 2000);
    store.add(4, a2, 5 * 60_000 + 500); // a expires here
    expect(store.take(4, c as any, 5 * 60_000 + 600)).toBe(true);
    expect(store.take(4, b as any, 5 * 60_000 + 600)).toBe(true);
    expect(store.take(4, a2 as any, 5 * 60_000 + 600)).toBe(true);
  });

  it("survives a reconnect burst of 6 nodes (fork kept only 5)", () => {
    const store = new legacyPassport.LegacyPassportStore();
    const all = [1, 2, 3, 4, 5, 6].map(mk);
    all.forEach((p) => store.add(4, p));
    for (const p of all) expect(store.take(4, p as any)).toBe(true);
  });

  it("is single use and rejects partial or regex-like input", () => {
    const store = new legacyPassport.LegacyPassportStore();
    const p = mk(1);
    store.add(4, p);
    expect(store.take(4, { ...p, key: ".*" } as any)).toBe(false);
    expect(store.take(4, { ...p, key: (p as any).key.slice(0, 10) } as any)).toBe(false);
    expect(store.take(4, p as any)).toBe(true);
    expect(store.take(4, p as any)).toBe(false);
  });

  it("fingerprints identically for every passport type on both sides", () => {
    for (const t of [1, 2, 3, 4] as const) {
      const raw = legacyPassport.createLegacyPassport(t, "k", "u");
      const store = new legacyPassport.LegacyPassportStore();
      store.add(t, legacyPassport.fingerprintPassport(raw, t, pairs));
      // daemon side: fingerprints each field it received
      const presented: Record<string, string> = {};
      for (const f of legacyPassport.legacyFields(t)) presented[f] = legacyPassport.legacyFingerprint((raw as any)[f], pairs);
      expect(store.take(t, presented)).toBe(true);
    }
  });
});

describe("standard handshake round trip", () => {
  it("panel and daemon prove possession to each other over one nonce pair", () => {
    const keys = { panel: standardPassport.generateSecretPair(), daemon: standardPassport.generateSecretPair() };
    const daemonNonce = standardPassport.generateNonce();
    const ids = { panelId: "panel-1", daemonId: "daemon-1" };
    const panelProof = standardPassport.createProof(keys, { role: "panel", ...ids, daemonNonce, panelNonce: standardPassport.generateNonce() });
    const cache = new standardPassport.NonceCache();
    expect(standardPassport.verifyProof(keys, panelProof, { expectedRole: "panel", ...ids, expectedNonce: { daemonNonce }, nonceCache: cache })).toBe(true);
    // replay of the same proof fails
    expect(standardPassport.verifyProof(keys, panelProof, { expectedRole: "panel", ...ids, expectedNonce: { daemonNonce }, nonceCache: cache })).toBe(false);
    const daemonProof = standardPassport.createProof(keys, { role: "daemon", ...ids, daemonNonce, panelNonce: panelProof.panelNonce });
    expect(standardPassport.verifyProof(keys, daemonProof, { expectedRole: "daemon", ...ids, expectedNonce: { daemonNonce, panelNonce: panelProof.panelNonce } })).toBe(true);
    // a panel proof can't be reflected as a daemon proof
    expect(standardPassport.verifyProof(keys, panelProof, { expectedRole: "daemon", ...ids, expectedNonce: { daemonNonce } })).toBe(false);
  });
});

describe("command sanitizer", () => {
  const o = DEFAULT_SANITIZER_OPTIONS;

  it("keeps Minecraft JSON commands intact", () => {
    const cmd = 'tellraw @a {"text":"ship it \\"now\\"","color":"gold"}';
    expect(sanitizeCommand(cmd, "minecraft", o)).toEqual({ ok: true, command: cmd });
  });

  it("does not mangle words that contain blocked commands (fork removed substrings)", () => {
    expect(sanitizeCommand("say shipping and going", "shell", o)).toEqual({ ok: true, command: "say shipping and going" });
  });

  it("rejects blocked shell commands, including chained and path forms", () => {
    expect(sanitizeCommand("rm -rf /", "shell", o).ok).toBe(false);
    expect(sanitizeCommand("list; /bin/rm x", "shell", o).matched).toBe("rm");
    expect(sanitizeCommand("stop && sudo reboot", "shell", o).ok).toBe(false);
    expect(sanitizeCommand("cat ../../etc/passwd", "shell", o).reason).toBe("blocked_fragment");
    expect(commandWords("a | b && $(c) ; `d`")).toEqual(["a", "b", "c", "d"]);
  });

  it("strips control characters, ANSI escapes and emoji", () => {
    expect(sanitizeCommand("say hi\u001b[31m\u0007 \u{1F600}there", "minecraft", o).command).toBe("say hi there");
  });

  it("matches configurable entries literally (no regex, no ReDoS)", () => {
    const opts = normalizeSanitizerOptions({ sanitizerConfigurableBlacklist: true, sanitizerBlacklist: ["op", "(a+)+$", "ban-ip "] });
    expect(sanitizeCommand("op Steve", "minecraft", opts).ok).toBe(false);
    expect(sanitizeCommand("say (a+)+$", "minecraft", opts).ok).toBe(true);
    expect(sanitizeCommand("ban-ip 1.2.3.4", "minecraft", opts).ok).toBe(false);
    expect(sanitizeCommand("deop Steve", "minecraft", opts).ok).toBe(true);
  });

  it("picks profiles from instance type and honours the switches", () => {
    expect(profileFor("minecraft/java", o)).toBe("minecraft");
    expect(profileFor("shell", o)).toBe("universal");
    expect(profileFor("minecraft/java", { ...o, mcSanitizer: false })).toBeNull();
    expect(sanitizeCommand("rm -rf /", null, o).ok).toBe(true);
    expect(sanitizeCommand("x".repeat(40000), "minecraft", o).reason).toBe("too_long");
  });
});
