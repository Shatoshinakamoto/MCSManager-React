/** Global dialog toggles (port of useAppToolsStore) plus the one-time API key display. */
import { create } from "zustand";

interface AppTools {
  showUserInfoDialog: boolean;
  /**
   * API key returned once by the panel after generation. Kept in memory only
   * (never persisted) and cleared on reload (CWE-312).
   */
  generatedApiKey?: string;
  setShowUserInfoDialog: (v: boolean) => void;
  setGeneratedApiKey: (v?: string) => void;
  inputDialog: { show: boolean; title: string; resolve?: (v: string) => void; reject?: (e: Error) => void };
  /** Promise-based single-line prompt (port of openInputDialog). Rejects on cancel. */
  openInputDialog: (title: string) => Promise<string>;
  closeInputDialog: () => void;
}

export const useAppTools = create<AppTools>((set) => ({
  showUserInfoDialog: false,
  generatedApiKey: undefined,
  setShowUserInfoDialog: (showUserInfoDialog) => set({ showUserInfoDialog }),
  setGeneratedApiKey: (generatedApiKey) => set({ generatedApiKey }),
  inputDialog: { show: false, title: "" },
  openInputDialog: (title) =>
    new Promise<string>((resolve, reject) => set({ inputDialog: { show: true, title, resolve, reject } })),
  closeInputDialog: () => set({ inputDialog: { show: false, title: "" } })
}));
