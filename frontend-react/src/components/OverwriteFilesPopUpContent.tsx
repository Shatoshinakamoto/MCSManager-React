/**
 * Body of the "file already exists" upload prompt
 * (port of components/OverwriteFilesPopUpContent.vue).
 * Reports the chosen action and the "apply to all" flag through onChange.
 */
import { Checkbox, Radio } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";

export type OverwriteChoice = "rename" | "overwrite" | "skip";

interface Props {
  count?: number;
  fileName: string;
  onChange: (v: { action: OverwriteChoice; all: boolean }) => void;
}

export default function OverwriteFilesPopUpContent({ count, fileName, onChange }: Props) {
  const [action, setAction] = useState<OverwriteChoice>("skip");
  const [all, setAll] = useState(false);
  return (
    <div className="overwrite-popup-content">
      <div className="mb-10">{t("TXT_CODE_58a55f17", { name: fileName })}</div>
      <Radio.Group
        value={action}
        className="flex-col"
        style={{ gap: 8, display: "flex", flexDirection: "column" }}
        onChange={(e) => {
          setAction(e.target.value);
          onChange({ action: e.target.value, all });
        }}
      >
        <Radio value="rename">{t("TXT_CODE_c83551f5")}</Radio>
        <Radio value="overwrite">{t("TXT_CODE_5bf41818")}</Radio>
        <Radio value="skip">{t("TXT_CODE_518528d0")}</Radio>
      </Radio.Group>
      {!!count && count > 1 && (
        <div className="mt-16">
          <Checkbox
            checked={all}
            onChange={(e) => {
              setAll(e.target.checked);
              onChange({ action, all: e.target.checked });
            }}
          >
            {t("TXT_CODE_5445f34b", { num: count - 1 })}
          </Checkbox>
        </div>
      )}
    </div>
  );
}
