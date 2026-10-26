/**
 * Themed `message` and `modal` for code outside React components (services, tools).
 * antd's static message cannot read the app theme; <AntdStaticBinder/>
 * inside <App> swaps in the context-aware instance from App.useApp().
 * Until it mounts, calls fall back to the static API.
 */
import { App, Modal, message as staticMessage } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import type { HookAPI as ModalInstance } from "antd/es/modal/useModal";

let current: MessageInstance = staticMessage;
let currentModal: ModalInstance = Modal as unknown as ModalInstance;

export const message: MessageInstance = new Proxy({} as MessageInstance, {
  get: (_target, key) => current[key as keyof MessageInstance]
});

export const modal: ModalInstance = new Proxy({} as ModalInstance, {
  get: (_target, key) => currentModal[key as keyof ModalInstance]
});

export function AntdStaticBinder(): null {
  const app = App.useApp();
  current = app.message;
  currentModal = app.modal;
  return null;
}
