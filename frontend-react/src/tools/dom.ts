/**
 * Loading-screen helpers for the static #before-app-mounted shell in index.html.
 *
 * Upstream defined these as inline <script> globals; they live here so the page
 * needs no inline script (CSP without 'unsafe-inline', CWE-79).
 *
 * Security: error text is written with textContent, never innerHTML, so a
 * backend error message cannot inject markup (CWE-79).
 */

function container(): HTMLElement | null {
  return document.getElementById("before-app-mounted");
}

/** Wire the Reload button that replaced upstream's inline onclick handler. */
export function bindLoadingReload(): void {
  document.getElementById("app-loading-reload")?.addEventListener("click", () => {
    window.location.reload();
  });
}

/** Update the subtitle under the spinner. */
export function setLoadingTitle(title: string): void {
  const el = container()?.querySelector<HTMLElement>(".loading-title");
  // SECURITY: textContent avoids HTML injection (CWE-79).
  if (el) el.textContent = title;
}

/** Hide the loading shell once React has painted. */
export function closeAppLoading(): void {
  container()?.setAttribute("style", "display:none");
}

/** Swap the spinner for an error box with a Reload button. */
export function setAppLoadingError(message: string): void {
  const root = container();
  if (!root) return;
  const loading = root.querySelector<HTMLElement>(".loading");
  const title = root.querySelector<HTMLElement>(".loading-title");
  if (loading) loading.style.display = "none";
  if (title) title.style.display = "none";
  const errorBox = root.querySelector<HTMLElement>(".loading-error");
  const msg = errorBox?.querySelector<HTMLElement>(".error-message");
  // SECURITY: textContent avoids HTML injection from server-provided errors (CWE-79).
  if (msg) msg.textContent = message;
  errorBox?.classList.add("show");
}
