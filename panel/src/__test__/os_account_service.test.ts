/**
 * Tests for service/os_account_service.ts: which OS account names the panel
 * accepts (no numeric ids, no shell syntax; CWE-20, CWE-88), that only a Web
 * Admin may link accounts (CWE-269), which instances an edit affects, and the
 * check -> apply -> persist order with nothing stored when a node refuses,
 * offline nodes blocking links but not unlinks, and best-effort deletion.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const current = { user: undefined as { permission: number; userName: string } | undefined };
vi.mock("../app/service/passport_service", () => ({ getUserFromCtx: () => current.user }));
vi.mock("../app/service/log", () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

type Call = { daemonId: string; event: string; data: any };
const calls: Call[] = [];
const nodes = new Map<string, { available: boolean; fail?: (event: string, data: any) => string | undefined }>();
vi.mock("../app/service/remote_service", () => ({
  default: {
    getInstance: (id: string) => {
      const n = nodes.get(id);
      return n ? { uuid: id, available: n.available, config: { remarks: `node-${id}`, ip: "127.0.0.1" } } : undefined;
    }
  }
}));
vi.mock("../app/service/remote_command", () => ({
  default: class {
    constructor(private r: any) {}
    async request(event: string, data: any) {
      calls.push({ daemonId: this.r.uuid, event, data });
      const err = nodes.get(this.r.uuid)?.fail?.(event, data);
      if (err) throw new Error(err);
      return {};
    }
  }
}));
const users = new Map<string, any>();
vi.mock("../app/service/user_service", () => ({ default: { objects: users } }));

const svc = await import("../app/service/os_account_service");

const user = (uuid: string, osAccount: string, instances: Array<[string, string]>) =>
  users.set(uuid, { uuid, osAccount, instances: instances.map(([daemonId, instanceUuid]) => ({ daemonId, instanceUuid })) });

beforeEach(() => {
  calls.length = 0;
  nodes.clear();
  users.clear();
  nodes.set("d1", { available: true });
  nodes.set("d2", { available: true });
});

describe("OS account names", () => {
  it("accepts POSIX and Windows names and an empty value", () => {
    for (const ok of ["", "alice", "mc_server", "DESKTOP-1\\alice", "John Smith"]) expect(svc.isValidOsAccount(ok)).toBe(true);
  });

  it("refuses numeric ids, options, shell and path syntax", () => {
    for (const bad of ["1000", "-u", "a;b", "$(id)", "a/b", "../x", " alice", "alice ", "a\nb", 5, null]) {
      expect(svc.isValidOsAccount(bad)).toBe(false);
    }
    expect(svc.normaliseOsAccount("  alice  ")).toBe("alice");
    expect(svc.normaliseOsAccount(undefined)).toBe("");
    expect(() => svc.normaliseOsAccount("0")).toThrow(/account name/);
  });

  it("lets only a Web Admin link accounts", () => {
    current.user = { permission: 20, userName: "owner" };
    expect(svc.canSetOsAccount({} as never)).toBe(true);
    current.user = { permission: 10, userName: "admin" };
    expect(svc.canSetOsAccount({} as never)).toBe(false);
    current.user = undefined;
    expect(svc.canSetOsAccount({} as never)).toBe(false);
  });
});

describe("affected instances", () => {
  it("lists only instances whose set of accounts changes", () => {
    const view = (o: string, i: Array<[string, string]>) => ({ osAccount: o, instances: i.map(([daemonId, instanceUuid]) => ({ daemonId, instanceUuid })) });
    const before = new Map([
      ["u1", view("alice", [["d1", "a"], ["d1", "b"]])],
      ["u2", view("", [["d1", "c"]])]
    ]);
    const after = new Map([
      ["u1", view("alice", [["d1", "a"], ["d1", "c"]])],
      ["u2", view("", [["d1", "c"]])]
    ]);
    const pairs = svc.affectedPairs(before, after);
    expect(pairs).toEqual(
      expect.arrayContaining([
        { daemonId: "d1", instanceUuid: "b", accounts: [] },
        { daemonId: "d1", instanceUuid: "c", accounts: ["alice"] }
      ])
    );
    expect(pairs).toHaveLength(2);
  });
});

describe("coordinated edits", () => {
  it("checks every node, then applies, then stores", async () => {
    user("u1", "", [["d1", "a"], ["d2", "b"]]);
    const order: string[] = [];
    const persist = vi.fn(async () => {
      order.push("persist");
    });
    await svc.commitBindingChange([{ uuid: "u1", osAccount: "alice" }], persist);
    order.unshift(...calls.map((c) => `${c.event}:${c.data.instanceUuid}`));
    expect(order).toEqual([
      "instance/os_account/check:a",
      "instance/os_account/check:b",
      "instance/os_account/apply:a",
      "instance/os_account/apply:b",
      "persist"
    ]);
    expect(calls[0].data.accounts).toEqual(["alice"]);
  });

  it("stores nothing and applies nothing when a node refuses the check", async () => {
    user("u1", "", [["d1", "a"], ["d2", "b"]]);
    nodes.set("d2", { available: true, fail: (e) => (e.endsWith("check") ? "uid 0 is refused" : undefined) });
    const persist = vi.fn(async () => {});
    await expect(svc.commitBindingChange([{ uuid: "u1", osAccount: "root" }], persist)).rejects.toThrow(/Nothing was changed.*uid 0/);
    expect(persist).not.toHaveBeenCalled();
    expect(calls.some((c) => c.event.endsWith("apply"))).toBe(false);
  });

  it("never reports a failed apply as done", async () => {
    user("u1", "", [["d1", "a"], ["d2", "b"]]);
    nodes.set("d2", { available: true, fail: (e) => (e.endsWith("apply") ? "3 entries failed" : undefined) });
    const persist = vi.fn(async () => {});
    await expect(svc.commitBindingChange([{ uuid: "u1", osAccount: "alice" }], persist)).rejects.toThrow(/not saved.*3 entries failed.*already updated/);
    expect(persist).not.toHaveBeenCalled();
  });

  it("blocks a link on an offline node but not an unlink", async () => {
    user("u1", "alice", [["d1", "a"]]);
    nodes.set("d1", { available: false });
    const persist = vi.fn(async () => {});
    await expect(svc.commitBindingChange([{ uuid: "u1", osAccount: "bob" }], persist)).rejects.toThrow(/offline/);
    expect(persist).not.toHaveBeenCalled();
    const r = await svc.commitBindingChange([{ uuid: "u1", instances: [] }], persist);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(r.warnings.join(" ")).toMatch(/offline/);
  });

  it("skips daemon calls when an edit changes no binding", async () => {
    user("u1", "", [["d1", "a"]]);
    const persist = vi.fn(async () => {});
    await svc.commitBindingChange([{ uuid: "u1", instances: [{ daemonId: "d1", instanceUuid: "b" }] }], persist);
    expect(calls).toHaveLength(0);
    expect(persist).toHaveBeenCalled();
  });

  it("deletes users best effort", async () => {
    user("u1", "alice", [["d1", "a"]]);
    nodes.set("d1", { available: true, fail: () => "node error" });
    const persist = vi.fn(async () => {});
    const r = await svc.commitBindingChange([{ uuid: "u1", deleted: true }], persist, { bestEffort: true });
    expect(persist).toHaveBeenCalled();
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("refuses malformed assignments before calling any node", async () => {
    user("u1", "alice", []);
    await expect(svc.commitBindingChange([{ uuid: "u1", instances: [{ daemonId: "d1" } as never] }], async () => {})).rejects.toThrow(/IUserHaveInstance/);
    expect(calls).toHaveLength(0);
  });
});
