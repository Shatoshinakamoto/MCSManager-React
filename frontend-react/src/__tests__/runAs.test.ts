/**
 * Tests for runAsFieldState (hooks/useNodeRunAs.ts): the "Run as" field is
 * editable only for Web Admins, and for host processes only on a daemon that
 * runs as root. The panel and daemon enforce the same rules.
 */
import { describe, expect, it } from "vitest";
import { runAsFieldState } from "@/hooks/useNodeRunAs";

const root = { supported: true, platform: "linux", defaultUser: "", allowedUsers: [], allowRoot: false };

describe("run as field", () => {
  it("is locked for anyone but a Web Admin", () => {
    expect(runAsFieldState({ isWebAdmin: false, isGlobal: false, isDocker: false, info: root })).toEqual({ kind: "locked", reason: "not-web-admin" });
  });

  it("is locked on a daemon that is not root, except for Docker", () => {
    const user = { ...root, supported: false };
    expect(runAsFieldState({ isWebAdmin: true, isGlobal: false, isDocker: false, info: user })).toEqual({ kind: "locked", reason: "not-root" });
    expect(runAsFieldState({ isWebAdmin: true, isGlobal: false, isDocker: true, info: user })).toEqual({ kind: "edit" });
  });

  it("offers the daemon's allowed accounts as a list", () => {
    expect(runAsFieldState({ isWebAdmin: true, isGlobal: false, isDocker: false, info: { ...root, allowedUsers: ["steam"] } })).toEqual({ kind: "edit", options: ["steam"] });
    expect(runAsFieldState({ isWebAdmin: true, isGlobal: false, isDocker: false, info: root })).toEqual({ kind: "edit", options: undefined });
  });

  it("is locked on Windows and for the global instance", () => {
    expect(runAsFieldState({ isWebAdmin: true, isGlobal: false, isDocker: false, info: { ...root, platform: "win32", supported: false } })).toEqual({ kind: "locked", reason: "windows" });
    expect(runAsFieldState({ isWebAdmin: true, isGlobal: true, isDocker: false, info: root })).toEqual({ kind: "locked", reason: "global" });
  });
});
