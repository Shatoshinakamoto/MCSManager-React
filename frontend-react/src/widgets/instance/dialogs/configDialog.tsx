/**
 * Shared pieces for the small instance settings dialogs (terminal, events,
 * RCON, ping): a titled field block and the open/save/close state.
 * Each dialog sends only the fields it edits to
 * PUT /api/protected_instance/instance_update, as upstream does; the panel
 * checks the user's permission and filters fields server-side.
 */
import { App, Typography } from "antd";
import { useState, type ReactNode } from "react";
import { t } from "@/lang/i18n";
import { updateInstanceConfig } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";

export interface InstanceDialogProps {
  instanceId: string;
  daemonId: string;
  /** Resolves the dialog: true when settings were saved. */
  done: (saved: boolean) => void;
}

export function Field({ title, desc, children }: { title: ReactNode; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="ant-form-item" style={{ marginBottom: 24 }}>
      <Typography.Title level={5}>{title}</Typography.Title>
      {desc && (
        <Typography.Paragraph>
          <Typography.Text type="secondary">{desc}</Typography.Text>
        </Typography.Paragraph>
      )}
      {children}
    </div>
  );
}

/** Two description lines joined with a line break, as the upstream templates do. */
export const lines = (...keys: string[]) =>
  keys.map((k, i) => (
    <span key={k}>
      {i > 0 && <br />}
      {t(k)}
    </span>
  ));

export function useInstanceDialog({ instanceId, daemonId, done }: InstanceDialogProps) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const close = (saved = false) => {
    setOpen(false);
    done(saved);
  };
  const save = async (data: Record<string, unknown>) => {
    setLoading(true);
    try {
      await updateInstanceConfig({ params: { uuid: instanceId, daemonId }, data });
      message.success(t("TXT_CODE_d3de39b4"));
      close(true);
    } catch (error) {
      reportErrorMsg(error);
    } finally {
      setLoading(false);
    }
  };
  return { open, loading, close, save };
}
