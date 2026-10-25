/**
 * Boot sequence, same order as upstream main.ts: panel status -> language ->
 * layout -> lazy-load and mount the app, with progress on the loading screen.
 */
import { initI18n, t } from "@/lang/i18n";
import { useAppState } from "@/stores/appState";
import { initLayoutConfig } from "@/stores/layoutConfig";
import { bindLoadingReload, setAppLoadingError, setLoadingTitle } from "@/tools/dom";

function handleLoadingError(error: unknown) {
  console.error("Init app error:", error);
  const msg = String((error as Error)?.message ?? error);
  if (msg.toLowerCase().includes("status code 500")) {
    setAppLoadingError("The backend is currently unavailable, please try again later.");
    return;
  }
  setAppLoadingError(msg);
}

async function initApp() {
  bindLoadingReload();
  try {
    setLoadingTitle("Initializing Application...");
    await useAppState.getState().updatePanelStatus();
    setLoadingTitle("Initializing Language...");
    await initI18n(useAppState.getState().language);
    setLoadingTitle("Initializing Layout...");
    await initLayoutConfig(t("TXT_CODE_47ae8ee6"));
    setLoadingTitle("Downloading JavaScript Files...");
    const { mountApp } = await import("./mount");
    setLoadingTitle("Rendering Application...");
    await mountApp();
  } catch (error) {
    handleLoadingError(error);
  }
}

void initApp();
