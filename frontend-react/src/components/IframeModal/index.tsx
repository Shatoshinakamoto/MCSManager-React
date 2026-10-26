/**
 * Large dialog showing an IframeBox (port of components/IframeModal/index.vue
 * and useIframeModal.ts). Opened by the bridge's OpenNewIframePage handler;
 * no other page opens it yet, as upstream.
 */
import { Modal } from "antd";
import { useState } from "react";
import IframeBox from "@/components/IframeBox";
import { openDialog } from "@/stores/dialogHost";
import "./index.scss";

export interface IframeModalOptions {
  src: string;
  title?: string;
  /** Passed to IframeBox: the message bridge is off unless set. */
  bridge?: boolean;
  allowedOrigins?: string[];
}

function IframeModal({ options, done }: { options: IframeModalOptions; done: () => void }) {
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    done();
  };
  return (
    <Modal open={open} width="80%" title={options.title} footer={null} closable mask={{ closable: true }} destroyOnHidden centered className="iframe-modal" onCancel={close}>
      <div className="iframe-modal-content">
        <IframeBox src={options.src} bridge={options.bridge} allowedOrigins={options.allowedOrigins} width="100%" height="100%" />
      </div>
    </Modal>
  );
}

/** Opens the framed-page dialog; resolves when it is closed. */
export function openIframeModal(options: IframeModalOptions): Promise<void> {
  return openDialog<void>((done) => <IframeModal options={options} done={() => done()} />);
}
