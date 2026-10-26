/**
 * Vite build and dev-server config for the React port of the MCSManager UI.
 *
 * Purpose: bundle the SPA and, in development, proxy API, socket.io and
 * file-transfer routes to a local MCSManager panel (default :23333), exactly
 * like the upstream Vue frontend so the panel needs no changes.
 *
 * Trust boundaries: the dev proxy forwards browser traffic to the panel. It is
 * only used by `vite dev`; production assets are static files served by the
 * panel itself.
 *
 * Security:
 * - Production sourcemaps are "hidden" (generated for crash triage, not
 *   referenced from the bundle) to avoid shipping source to every client
 *   (CWE-540, ASVS V14.3.2).
 * - `allowedHosts` is limited to localhost by default instead of upstream's
 *   `true`, which would accept any Host header and enable DNS-rebinding
 *   against the dev server (CWE-350). Set VITE_DEV_ALLOWED_HOSTS to widen it.
 */
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const PANEL_TARGET = process.env.MCSM_PANEL_URL ?? "http://localhost:23333";

// SECURITY: explicit Host allow-list for the dev server (CWE-350, DNS rebinding).
const allowedHosts = (process.env.VITE_DEV_ALLOWED_HOSTS ?? "localhost,127.0.0.1")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@languages": fileURLToPath(new URL("../languages", import.meta.url))
    }
  },
  build: {
    // SECURITY: maps are emitted but not linked from the bundle (CWE-540).
    sourcemap: "hidden",
    chunkSizeWarningLimit: 1024
  },
  server: {
    host: true,
    allowedHosts,
    // Same routes the upstream Vue frontend proxies to the panel.
    proxy: {
      "/api": { target: PANEL_TARGET, changeOrigin: true, ws: true },
      "/socket.io": { target: PANEL_TARGET.replace(/^http/, "ws"), ws: true },
      "/upload_files": { target: PANEL_TARGET, changeOrigin: true },
      "/upload-new": { target: PANEL_TARGET, changeOrigin: true },
      "/upload-piece": { target: PANEL_TARGET, changeOrigin: true },
      "/download": { target: PANEL_TARGET, changeOrigin: true }
    }
  },
  test: {
    environment: "jsdom",
    // e2e/*.spec.ts are Playwright tests (npm run test:e2e), not unit tests.
    include: ["src/**/*.test.{ts,tsx}"],
    globals: false,
    setupFiles: ["./vitest.setup.ts"]
  }
});
