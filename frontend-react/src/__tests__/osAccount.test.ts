/**
 * Tests for the OS account parts of the React UI
 * (openspec/changes/link-panel-users-to-os-accounts): the account name rule
 * matches the panel's (no numeric ids, no shell or path syntax; CWE-20),
 * warnings from a saved edit are read safely, and Java runtimes are selected
 * by the daemon's id so a shared runtime and an account's own runtime with the
 * same name never mix. The new texts exist in every language and use the
 * frontend's single-brace placeholders.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { osAccountWarnings } from "@/services/apis/user";
import { isValidOsAccountName } from "@/tools/validator";
import { javaRuntimeId } from "@/widgets/instance/dialogs/JavaManager";

describe("OS account names", () => {
  it("accepts POSIX and Windows names and an empty value", () => {
    for (const ok of ["", "alice", "mc_server", "_svc", "DESKTOP-1\\alice", "John Smith"]) expect(isValidOsAccountName(ok)).toBe(true);
  });

  it("refuses numeric ids, options, shell and path syntax", () => {
    for (const bad of ["0", "1000", "-u", "a;b", "$(id)", "a/b", "../x", " alice", "alice ", "a\nb", "a".repeat(33)]) {
      expect(isValidOsAccountName(bad)).toBe(false);
    }
  });
});

describe("saved edit warnings", () => {
  it("returns the panel's warnings and nothing for a plain success", () => {
    expect(osAccountWarnings(true)).toEqual([]);
    expect(osAccountWarnings(undefined)).toEqual([]);
    expect(osAccountWarnings({ warnings: ["node offline"] })).toEqual(["node offline"]);
  });
});

describe("Java runtime ids", () => {
  const runtime = (fullname: string, id?: string) => ({ id, info: { fullname } }) as Parameters<typeof javaRuntimeId>[0];
  it("uses the daemon's id and falls back to the name for older daemons", () => {
    expect(javaRuntimeId(runtime("jdk-21", "jdk-21@1000-1000"))).toBe("jdk-21@1000-1000");
    expect(javaRuntimeId(runtime("jdk-21"))).toBe("jdk-21");
  });
});

describe("OS account texts", () => {
  const dir = path.resolve(__dirname, "../../../languages");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const en = JSON.parse(fs.readFileSync(path.join(dir, "en_US.json"), "utf8")) as Record<string, string>;
  const keys = Object.keys(en).filter((k) => k.startsWith("TXT_CODE_OSACCOUNT_") || k === "TXT_CODE_RUNAS_DEFAULT_USER");

  it("are in all 12 languages with {name} placeholders", () => {
    expect(files).toHaveLength(12);
    expect(keys.length).toBeGreaterThanOrEqual(11);
    for (const f of files) {
      const lang = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Record<string, string>;
      for (const k of keys) {
        expect(lang[k], `${f} ${k}`).toBeTruthy();
        expect(lang[k], `${f} ${k}`).not.toMatch(/\{\{/);
        const want = (en[k].match(/\{\w+\}/g) ?? []).sort().join();
        expect([...new Set(lang[k].match(/\{\w+\}/g) ?? [])].sort().join(), `${f} ${k}`).toBe([...new Set(want.split(",").filter(Boolean))].sort().join());
      }
    }
  });
});
