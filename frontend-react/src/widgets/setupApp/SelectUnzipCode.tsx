/** Archive filename encoding picker for imports (port of widgets/instance/dialogs/SelectUnzipCode.vue). */
import { Modal, Select, Typography } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import { message } from "@/tools/antdStatic";
import { reportErrorMsg } from "@/tools/validator";

function SelectUnzipCode({ done }: { done: (code: string | undefined) => void }) {
  const [open, setOpen] = useState(true);
  const [code, setCode] = useState<string>();
  const submit = () => {
    if (!code) return reportErrorMsg(t("TXT_CODE_97ceb743"));
    setOpen(false);
    done(code);
    message.success(t("TXT_CODE_f07610ed"));
  };
  return (
    <Modal
      open={open}
      centered
      mask={{ closable: false }}
      title={t("TXT_CODE_2dc23f7a")}
      okText={t("TXT_CODE_abfe9512")}
      onOk={submit}
      onCancel={() => {
        setOpen(false);
        done(undefined);
      }}
    >
      <Typography.Paragraph>
        <Typography.Text type="secondary">
          {t("TXT_CODE_b278707d")}
          <br />
          {t("TXT_CODE_48044fc2")}
          <br />
          {t("TXT_CODE_76a82338")}
        </Typography.Text>
      </Typography.Paragraph>
      <Select
        value={code}
        placeholder={t("TXT_CODE_3bb646e4")}
        popupMatchSelectWidth={false}
        onChange={setCode}
        options={[
          { value: "utf-8", label: t("TXT_CODE_91bb6101") },
          { value: "gbk", label: t("TXT_CODE_4d6b06f0") },
          { value: "big5", label: t("TXT_CODE_c4dfdb26") }
        ]}
      />
    </Modal>
  );
}

export function openSelectUnzipCode() {
  return openDialog<string | undefined>((done) => <SelectUnzipCode done={done} />);
}
