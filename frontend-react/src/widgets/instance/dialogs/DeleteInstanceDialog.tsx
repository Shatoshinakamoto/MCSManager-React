/** Delete one instance, optionally with its files (port of DeleteInstanceDialog.vue). Resolves true when deleted. */
import { App, Button, Checkbox, Modal, Typography } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";
import { batchDelete } from "@/services/apis/instance";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";

interface Props {
  instanceId: string;
  daemonId: string;
  done: (ok: boolean) => void;
}

function DeleteInstanceDialog({ instanceId, daemonId, done }: Props) {
  const { modal } = App.useApp();
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  const close = (ok: boolean) => {
    setOpen(false);
    done(ok);
  };

  const submit = async () => {
    setLoading(true);
    try {
      await batchDelete({ params: { daemonId }, data: { uuids: [instanceId], deleteFile: deleteFiles } });
      close(true);
    } catch (error) {
      reportErrorMsg(error);
      close(false);
    } finally {
      setLoading(false);
    }
  };

  // Deleting files cannot be undone, so it needs a second confirmation (upstream behaviour).
  const onDelete = () => {
    if (!deleteFiles) return void submit();
    modal.confirm({
      title: t("TXT_CODE_584d786d"),
      content: t("TXT_CODE_90508729"),
      okText: t("TXT_CODE_10088738"),
      okType: "danger",
      onOk: submit
    });
  };

  return (
    <Modal
      open={open}
      title={t("TXT_CODE_a0e19f38")}
      onCancel={() => close(false)}
      footer={[
        <Button key="back" onClick={() => close(false)}>
          {t("TXT_CODE_a0451c97")}
        </Button>,
        <Button key="submit" danger={deleteFiles} loading={loading} type="primary" onClick={onDelete}>
          {deleteFiles ? t("TXT_CODE_584d786d") : t("TXT_CODE_a0e19f38")}
        </Button>
      ]}
    >
      <Typography.Paragraph>
        <Typography.Text>{t("TXT_CODE_1981470a")}</Typography.Text>
      </Typography.Paragraph>
      <Checkbox checked={deleteFiles} onChange={(e) => setDeleteFiles(e.target.checked)}>
        {t("TXT_CODE_7542201a")}
      </Checkbox>
    </Modal>
  );
}

/** Upstream name: useDeleteInstanceDialog (renamed: it is not a React hook). */
export function openDeleteInstanceDialog(instanceId: string, daemonId: string): Promise<boolean> {
  return openDialog<boolean>((done) => <DeleteInstanceDialog instanceId={instanceId} daemonId={daemonId} done={done} />);
}
