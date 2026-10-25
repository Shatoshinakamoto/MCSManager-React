/** Loads styles, fetches the session user and mounts React (port of mount.ts). */
import "antd/dist/reset.css";
import "@/assets/base.scss";
import "@/assets/tools.scss";
import "@/assets/variables.scss";
import "@/assets/variables-dark.scss";
import "@/assets/global.scss";
import "@/assets/bg-extend-theme.scss";
import "@/assets/antd-compat.scss";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router";
import App from "./App";
import { userInfoApi } from "./services/apis";
import { useAppState } from "./stores/appState";

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

export async function mountApp(): Promise<void> {
  try {
    const info = await userInfoApi();
    if (info) await useAppState.getState().updateUserInfo(info);
  } catch (err) {
    // Not logged in is the normal case on first visit.
    console.error("Init user info Error:", err);
  }
  const el = document.getElementById("app-mount-point");
  if (!el) throw new Error("Mount point #app-mount-point not found");
  // Hash routing keeps upstream URLs (./#/instances/...) and needs no panel changes.
  createRoot(el).render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>
  );
}
