/** Icon button that copies a value (port of CopyButton.vue). */
import { CopyOutlined } from "@ant-design/icons";
import { Button, Tooltip, type ButtonProps } from "antd";
import { t } from "@/lang/i18n";
import { toCopy } from "@/tools/copy";

export default function CopyButton({ value, size, type }: { value: string; size?: ButtonProps["size"]; type?: ButtonProps["type"] }) {
  return (
    <Tooltip title={t("TXT_CODE_13ae6a93")}>
      <Button type={type} size={size} icon={<CopyOutlined />} onClick={() => toCopy(value)} />
    </Tooltip>
  );
}
