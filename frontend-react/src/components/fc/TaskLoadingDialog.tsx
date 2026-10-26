/**
 * Blocking "working on it" dialog (port of components/fc/TaskLoadingDialog.vue).
 * Used while the daemon compresses, extracts or downloads files.
 * openLoadingDialog returns { cancel } so the caller closes it in a finally block.
 */
import { LoadingOutlined } from "@ant-design/icons";
import { Modal, Typography } from "antd";
import { useState } from "react";
import { openDialog } from "@/stores/dialogHost";

interface Props {
  title: string;
  text: string;
  subTitle?: string;
  register: (close: () => void) => void;
}

function TaskLoadingDialog({ title, text, subTitle, register }: Props) {
  const [open, setOpen] = useState(true);
  register(() => setOpen(false));
  return (
    <Modal open={open} centered width={600} title={title} mask={{ closable: false }} closable={false} footer={null}>
      <div className="dialog-overflow-container">
        <div className="flex flex-center">
          <div>
            <Typography.Paragraph>
              <Typography.Title level={5}>
                <div className="flex flex-center mb-20">
                  <LoadingOutlined style={{ fontSize: 60 }} />
                </div>
                <div className="flex flex-center" style={{ gap: 10 }}>
                  {text}
                </div>
              </Typography.Title>
              {subTitle && (
                <Typography.Text>
                  <div className="flex-center" style={{ fontSize: 12, opacity: 0.8, maxWidth: 300, textAlign: "center" }}>
                    {subTitle}
                  </div>
                </Typography.Text>
              )}
            </Typography.Paragraph>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Show the loading dialog; call cancel() when the task ends (success or error). */
export function openLoadingDialog(title: string, text: string, subTitle?: string): { cancel: () => void } {
  let finish: (() => void) | undefined;
  let hide: (() => void) | undefined;
  void openDialog<void>((done) => {
    finish = () => done();
    return <TaskLoadingDialog title={title} text={text} subTitle={subTitle} register={(close) => (hide = close)} />;
  });
  return {
    cancel: () => {
      hide?.();
      finish?.();
    }
  };
}
