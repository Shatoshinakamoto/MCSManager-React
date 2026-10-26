/**
 * Dev-tools blocker, ported from the Johnnykins fork (App.vue onMounted).
 *
 * When the panel's `devBlocker` setting is on, the page closes itself as soon
 * as browser developer tools are detected, and the React DevTools hook is
 * neutered. The fork read the switch from /api/overview/systemconfig; the same
 * boolean now also comes with /api/auth/status, so no extra request is made.
 *
 * SECURITY-WARNING: this is a deterrent, not a control. Anyone can read the
 * bundle, use another browser profile or call the API directly, so nothing
 * here protects data. Authorisation stays on the panel.
 *
 * Differences from the fork:
 * - Both packages are bundled and pinned (package.json); the fork also loaded
 *   disable-devtool from jsDelivr without integrity checking, which the CSP
 *   now blocks anyway.
 * - timeOutUrl is "about:blank": the library's default fallback redirects to a
 *   third-party page with this panel's host name in the query string.
 */

/**
 * Turn the blocker on. Call before the React app chunk loads so the DevTools
 * hook is replaced before react-dom registers with it.
 */
export async function enableDevBlocker(): Promise<void> {
  const [{ disableReactDevTools }, { default: DisableDevtool }] = await Promise.all([
    import("@fvilers/disable-react-devtools"),
    import("disable-devtool")
  ]);
  disableReactDevTools();
  DisableDevtool({
    ondevtoolopen(_type, next) {
      window.close();
      next();
    },
    timeOutUrl: "about:blank",
    disableMenu: false
  });
}
