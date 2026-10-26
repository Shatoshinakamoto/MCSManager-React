# Legacy plugins (old plugin API)

## 1. What it does
The plugin card shows an HTML page inside a panel layout. MCSManager 10.x ran such pages directly in the panel and gave them `window.$axios`, `$theme`, `$realWindow`, `$onMounted` and `$onUnmounted`. This port runs every plugin in an isolated frame. With **Old plugin API** on, those names work again inside the frame, so most old plugins run unchanged.

## 2. How to use it
1. Click the layout icon in the top bar to enter design mode.
2. On a plugin card, either click **Set HTML page address** (a full http(s) URL) or **Upload HTML File**. Uploads turn on Old plugin API automatically.
3. Switch **Old plugin API** on or off. Leave it off for plugins written for the new frame (they receive `{ type: "mcsmanager:theme", theme }` messages).
4. If the plugin shows panel data, switch **Allow read-only panel data** on. Only do this for plugins you trust.
5. Save the layout.

| Card setting (layout meta) | Values | Default |
|---|---|---|
| `url` | http(s) URL, or `/upload_files/<id>.html` | empty |
| `legacyApi` | `true` / `false` | `true` for uploads, `false` for URLs |
| `apiAccess` | `"none"` / `"read"` | `"none"` |

Panel endpoints a plugin may read with `apiAccess: "read"` (GET only): `/api/overview`, `/api/service/remote_services_list`, `/api/service/remote_services_system`, `/api/service/remote_services`, `/api/service/remote_service_instances`, `/api/instance`. Anything else answers 403. Requests run as the person viewing the page, so a non-admin viewer gets the panel's normal 403.

What changed for plugin authors:
- `$realWindow` is the frame's window, not the panel's.
- `$axios` calls to other sites use `fetch` without cookies; the other site must allow CORS.
- `$axios` calls to the panel return the panel envelope in `res.data` (`{ status, data, time }`) as before; interceptors are accepted but ignored.
- `eval` and `new Function` are blocked by the host's CSP.
- New: `window.$onThemeChange(cb)` is called with the new `$theme` when the panel theme changes.

## 3. How it is secure
- The host page (`public/plugin-host.html`) runs in an iframe sandboxed without `allow-same-origin`, and the panel sends it a CSP `sandbox` directive too. It has an opaque origin: no panel cookies, storage, DOM, or navigation of the panel tab (CWE-94, CWE-829, CWE-1021).
- The panel's own CSP keeps `script-src 'self'` without eval; only the host page allows inline plugin scripts, and never eval.
- Panel data is default-deny, read-only and allow-listed, with path normalisation, credential parameters dropped and a 30-per-10-seconds rate limit (CWE-285, CWE-22, CWE-770).
- Uploaded `.html`/`.svg`/`.xml`/`.js` files are served as plain text with `nosniff` and a CSP sandbox, so opening one directly runs nothing (CWE-79, CWE-434).
- SECURITY-WARNING: with panel data on, a plugin can send what it reads (daemon addresses, instance names) to its own server.

## 4. Configuration example
```json
{ "id": "status-plugin", "type": "PluginCard", "title": "Server status", "width": 6, "height": "360px",
  "meta": { "url": "/upload_files/7f0c...e1.html", "legacyApi": true, "apiAccess": "read" } }
```

## 5. FAQ
- **The card shows "Plugin download failed (HTTP ...)".** The URL is wrong, or the other site does not allow CORS. Upload the file instead.
- **My plugin changed panel settings or started instances.** That is no longer possible from a plugin.
- **My plugin used `eval`.** Rewrite that part; the host page blocks eval.
