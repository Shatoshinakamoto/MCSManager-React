/**
 * Floating "uploading in the background" bubble (port of components/UploadBubble.vue).
 * Shows how many files are left and the current file's progress while the
 * upload queue (services/uploadService.ts) is running.
 */
import { CloudUploadOutlined } from "@ant-design/icons";
import { FloatButton } from "antd";
import { t } from "@/lang/i18n";
import { useUploadState } from "@/services/uploadService";
import "./UploadBubble.scss";

export default function UploadBubble() {
  const files = useUploadState((s) => s.files);
  const current = useUploadState((s) => s.current);
  const suspending = useUploadState((s) => s.suspending);
  if (!current || suspending) return null;

  const count = (files[1] ?? 0) - (files[0] ?? 0) + 1;
  const progress = current[1] ? ((current[0] * 100) / current[1]).toFixed(0) : "0";
  return (
    <FloatButton
      className="frosted-float-button"
      icon={<CloudUploadOutlined />}
      badge={{ count, overflowCount: 99, color: "blue" }}
      tooltip={`${t("TXT_CODE_b0ff4172", { n: count })} (${progress}%)`}
    />
  );
}
