/**
 * Johnnykins ban list for the daemon socket: bans an address after too many
 * failed "auth" attempts. Ported from the fork's SQLite banDB.
 *
 * What changed from the fork, and why:
 * - The fork's ban id was a hex dump of Cloudflare and X-Forwarded-For
 *   headers plus the socket address. Any client can send those headers, so an
 *   attacker could get a fresh id per attempt (unlimited guessing) or forge a
 *   victim's id (CWE-290, CWE-348). Now the key is the socket address, and
 *   forwarding headers are only read from configured trusted proxies.
 * - The fork opened a new SQLite connection on every socket event and, on
 *   first start, raced an async backup against reads of a file with no
 *   tables. Both made connections fail intermittently. This list lives in
 *   memory and is saved with an atomic write after each change.
 * - Attempt timestamps were never written, so "forgiveBans" lifted every ban
 *   on the first sweep. Bans now carry an explicit expiry.
 * - Successful logins now reset the failure count, so a panel that
 *   reconnects often never locks itself out.
 *
 * SECURITY: NIST AC-7 (unsuccessful logon attempts), CWE-307.
 */
import fs from "fs-extra";
import path from "path";
import { globalConfiguration } from "../../entity/config";
import RouterContext from "../../entity/ctx";
import logger from "../log";

interface BanEntry {
  fails: number;
  bannedUntil: number; // epoch ms; 0 = not banned; Infinity = permanent
}

const FILE = path.join(process.cwd(), "data", "Security", "bans.json");
const MAX_TRACKED = 10_000;

function normalize(ip: string): string {
  const s = String(ip || "").trim();
  return s.startsWith("::ffff:") ? s.substring(7) : s;
}

class BanList {
  private readonly entries = new Map<string, BanEntry>();
  private loaded = false;

  private cfg() {
    return globalConfiguration.config.johnnykins.ban;
  }

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (!fs.existsSync(FILE)) return;
      const data = JSON.parse(fs.readFileSync(FILE, "utf-8"));
      if (!Array.isArray(data)) return;
      for (const row of data.slice(0, MAX_TRACKED)) {
        if (typeof row?.ip !== "string") continue;
        const until = row.bannedUntil === null ? Infinity : Number(row.bannedUntil);
        if (Number.isFinite(until) || until === Infinity) this.entries.set(row.ip, { fails: 0, bannedUntil: until });
      }
    } catch (err) {
      // A corrupt file must not stop the daemon or unban anyone silently.
      logger.warn("[Johnnykins] Could not read the ban list, starting empty:", (err as Error).message);
    }
  }

  private save() {
    try {
      const rows = [...this.entries]
        .filter(([, e]) => e.bannedUntil > Date.now())
        .map(([ip, e]) => ({ ip, bannedUntil: e.bannedUntil === Infinity ? null : e.bannedUntil }));
      fs.mkdirsSync(path.dirname(FILE));
      const tmp = `${FILE}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(rows), { encoding: "utf-8", mode: 0o600 });
      fs.renameSync(tmp, FILE);
    } catch (err) {
      logger.warn("[Johnnykins] Could not save the ban list:", (err as Error).message);
    }
  }

  /** The address used for banning: the socket peer, or the client behind a trusted proxy. */
  clientAddress(ctx: RouterContext): string {
    const peer = normalize(ctx.socket.handshake.address);
    const trusted = (this.cfg().trustedProxies || []).map(normalize);
    if (!trusted.includes(peer)) return peer;
    const xff = ctx.socket.handshake.headers["x-forwarded-for"];
    const hops = String(Array.isArray(xff) ? xff.join(",") : xff || "")
      .split(",")
      .map(normalize)
      .filter(Boolean);
    // Walk from the nearest hop back and take the first address that is not a trusted proxy.
    for (let i = hops.length - 1; i >= 0; i--) if (!trusted.includes(hops[i])) return hops[i];
    return peer;
  }

  isBanned(ip: string, now = Date.now()): boolean {
    const c = this.cfg();
    if (!c.enabled || c.whitelisted.map(normalize).includes(ip)) return false;
    this.load();
    const e = this.entries.get(ip);
    if (!e || e.bannedUntil === 0) return false;
    if (e.bannedUntil <= now) {
      this.entries.delete(ip);
      this.save();
      logger.info(`[Johnnykins] Ban expired for ${ip}`);
      return false;
    }
    return true;
  }

  /** Record a failed attempt. @returns true if this attempt caused a ban. */
  fail(ip: string, now = Date.now()): boolean {
    const c = this.cfg();
    if (!c.enabled || c.whitelisted.map(normalize).includes(ip)) return false;
    this.load();
    if (this.entries.size >= MAX_TRACKED && !this.entries.has(ip)) {
      // Drop the oldest non-banned entry to bound memory (CWE-400).
      for (const [k, e] of this.entries) if (e.bannedUntil === 0) { this.entries.delete(k); break; }
    }
    const e = this.entries.get(ip) ?? { fails: 0, bannedUntil: 0 };
    e.fails += 1;
    const max = Math.max(1, Number(c.maxFailedLoginsToBan) || 5);
    if (e.fails >= max) {
      const minutes = Number(c.banTime) || 0;
      e.bannedUntil = minutes > 0 ? now + minutes * 60_000 : Infinity;
      e.fails = 0;
      this.entries.set(ip, e);
      this.save();
      logger.warn(`[Johnnykins] Banned ${ip} after ${max} failed daemon logins (${minutes > 0 ? minutes + " min" : "permanent"})`);
      return true;
    }
    this.entries.set(ip, e);
    return false;
  }

  /** A successful login clears the failure count. */
  success(ip: string) {
    const e = this.entries.get(ip);
    if (e && e.bannedUntil === 0) this.entries.delete(ip);
  }
}

export const banList = new BanList();
