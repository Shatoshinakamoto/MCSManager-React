/** UI-only flags for the card layout (design mode, phone menu, new-card dialog). */
import { create } from "zustand";

interface ContainerState {
  isDesignMode: boolean;
  showPhoneMenu: boolean;
  showNewCardDialog: boolean;
  setDesignMode: (on: boolean) => void;
  setShowPhoneMenu: (on: boolean) => void;
  setShowNewCardDialog: (on: boolean) => void;
}

export const useLayoutContainer = create<ContainerState>((set) => ({
  isDesignMode: false,
  showPhoneMenu: false,
  showNewCardDialog: false,
  setDesignMode: (isDesignMode) => set({ isDesignMode }),
  setShowPhoneMenu: (showPhoneMenu) => set({ showPhoneMenu }),
  setShowNewCardDialog: (showNewCardDialog) => set({ showNewCardDialog })
}));
