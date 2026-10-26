/**
 * TamperProofPlugin (Johnnykins fork, Author: Johnathan Edward Brown):
 * after webpack emits app.js and app.js.map, writes their SHA-256 to
 * app-hash.txt and app_map-hash.txt. The panel and the daemon check these at
 * startup (common/src/tamper_check.ts). Used by panel/ and daemon/ webpack
 * configs. Kept as plain CommonJS because webpack loads it directly.
 *
 * SECURITY-WARNING: the hashes detect accidental changes only; anyone who can
 * write app.js can also rewrite these files.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PAIRS = [
  ["app.js", "app-hash.txt"],
  ["app.js.map", "app_map-hash.txt"]
];

class TamperProofPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap("TamperProofPlugin", () => {
      for (const [bundle, hashFile] of PAIRS) {
        const file = path.resolve(compiler.outputPath, bundle);
        if (!fs.existsSync(file)) continue;
        const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
        fs.writeFileSync(path.resolve(compiler.outputPath, hashFile), hash);
      }
    });
  }
}

module.exports = { TamperProofPlugin };
