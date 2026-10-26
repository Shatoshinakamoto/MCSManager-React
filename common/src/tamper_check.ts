/**
 * Build integrity check (the Johnnykins fork's TamperProofPlugin + verifyIntegrity).
 *
 * At build time common/tamper_proof_plugin.js writes the SHA-256 of app.js
 * and app.js.map to app-hash.txt and app_map-hash.txt. At startup the panel
 * and the daemon call verifyIntegrityOrExit(), which stops the process when a
 * file no longer matches its hash, as the fork did.
 *
 * SECURITY-WARNING: this detects accidental or careless edits of the bundle
 * (a half-applied update, a hand-patched app.js). It is not protection
 * against an attacker who can write to the install folder, who can rewrite
 * the hash files too. Real protection is file ownership and permissions on
 * the install folder (NIST SI-7 calls for signed or out-of-band references).
 *
 * Differences from the fork, each deliberate:
 * - Files are read once as bytes and compared with the hashes; no utf8 decode.
 * - The fork's every-30-seconds rmdir of "panel/production" is not ported. It
 *   resolved a path relative to the working directory, could only remove an
 *   empty folder, and so never protected anything.
 * - Missing hash files are refused with a clear message instead of an
 *   uncaught exception. --dev still skips the check under the fork's
 *   conditions, which each caller passes in as devAllowed.
 * - The self-updater refreshes the hashes after a package the operator chose
 *   to apply (see refreshIntegrityHashes and upgrade.ts).
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

export const APP_FILE = "app.js";
export const APP_MAP_FILE = "app.js.map";
export const APP_HASH_FILE = "app-hash.txt";
export const APP_MAP_HASH_FILE = "app_map-hash.txt";

/** [bundle file, hash file] pairs, in the order the fork checked them. */
const PAIRS: [string, string][] = [
  [APP_FILE, APP_HASH_FILE],
  [APP_MAP_FILE, APP_MAP_HASH_FILE]
];

export function sha256File(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export type IntegrityResult =
  | { status: "ok" }
  | { status: "missing"; file: string }
  | { status: "mismatch"; file: string };

/** Compare app.js and app.js.map in `dir` with their stored hashes. */
export function checkIntegrity(dir: string): IntegrityResult {
  for (const [bundle, hashFile] of PAIRS) {
    const bundlePath = path.join(dir, bundle);
    const hashPath = path.join(dir, hashFile);
    if (!fs.existsSync(bundlePath) || !fs.existsSync(hashPath)) return { status: "missing", file: hashFile };
    const stored = fs.readFileSync(hashPath, "utf8").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(stored) || sha256File(bundlePath) !== stored) return { status: "mismatch", file: bundle };
  }
  return { status: "ok" };
}

/** Write fresh hash files for whichever bundle files exist in `dir`. Returns the files written. */
export function refreshIntegrityHashes(dir: string): string[] {
  const written: string[] = [];
  for (const [bundle, hashFile] of PAIRS) {
    const bundlePath = path.join(dir, bundle);
    if (!fs.existsSync(bundlePath)) continue;
    fs.writeFileSync(path.join(dir, hashFile), sha256File(bundlePath));
    written.push(hashFile);
  }
  return written;
}

/** True when `dir` was built with integrity hashes (so an update must keep them in step). */
export function hasIntegrityHashes(dir: string): boolean {
  return fs.existsSync(path.join(dir, APP_HASH_FILE));
}

/** The folder of the running bundle (process.argv[1]); webpack rewrites __dirname. */
export function bundleDir(): string {
  return path.dirname(path.resolve(process.argv[1] ?? "app.js"));
}

interface IntegrityLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Startup gate. Exits the process (code 1) when the bundle does not match its
 * hashes, or when hashes are missing outside an allowed --dev run.
 * @param devAllowed the fork's --dev conditions for this program, already evaluated
 */
export function verifyIntegrityOrExit(opts: {
  name: string;
  logger: IntegrityLogger;
  devAllowed: boolean;
  dir?: string;
  exit?: (code: number) => never;
}): IntegrityResult {
  const dir = opts.dir ?? bundleDir();
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const dev = process.argv.includes("--dev");
  const result = checkIntegrity(dir);
  if (result.status === "ok") {
    opts.logger.info(`[TamperCheck] ${opts.name} bundle matches its build hashes.`);
    return result;
  }
  if (dev && opts.devAllowed) {
    opts.logger.warn(`[TamperCheck] --dev: integrity check skipped (${result.status}: ${result.file}).`);
    return result;
  }
  if (result.status === "mismatch") {
    opts.logger.error(
      `[TamperCheck] ${result.file} does not match its build hash. The ${opts.name} has been modified since it was built and will not start.`
    );
  } else {
    opts.logger.error(
      `[TamperCheck] ${result.file} is missing next to ${APP_FILE}. Rebuild with "npm run build" (it writes the hash files), or start with --dev for a development setup.`
    );
  }
  exit(1);
  return result;
}
