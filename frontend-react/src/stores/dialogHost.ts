/**
 * Promise-based dialogs (React counterpart of upstream useMountComponent in
 * components/fc). openDialog renders a dialog inside the app's ConfigProvider
 * through <DialogHost/> and resolves with the value the dialog passes to done().
 */
import type { ReactNode } from "react";
import { create } from "zustand";
import { getRandomId } from "@/tools/common";

interface Entry {
  id: string;
  node: ReactNode;
}

interface DialogHostState {
  dialogs: Entry[];
  remove: (id: string) => void;
}

export const useDialogHost = create<DialogHostState>((set) => ({
  dialogs: [],
  remove: (id) => set((s) => ({ dialogs: s.dialogs.filter((d) => d.id !== id) }))
}));

/** How long a closed dialog stays mounted so antd can play the close animation. */
const UNMOUNT_DELAY_MS = 400;

/**
 * Show a dialog and wait for its result.
 * @param render receives done(result); call it exactly once when the dialog closes.
 */
export function openDialog<R>(render: (done: (result: R) => void) => ReactNode): Promise<R> {
  const id = getRandomId();
  return new Promise<R>((resolve) => {
    let finished = false;
    const done = (result: R) => {
      if (finished) return;
      finished = true;
      resolve(result);
      setTimeout(() => useDialogHost.getState().remove(id), UNMOUNT_DELAY_MS);
    };
    useDialogHost.setState((s) => ({ dialogs: [...s.dialogs, { id, node: render(done) }] }));
  });
}
