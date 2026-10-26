/**
 * Docker image picker (port of dialogs/components/DockerImageSelect.vue):
 * a select filled from the daemon's image list on focus, with an option to
 * switch to free-text entry. Optional "no image" (empty) and "run on host"
 * entries are used by the update-command image field.
 */
import { Input, Select } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";
import { imageList } from "@/services/apis/envImage";

const IMAGE_EDIT = "__MCSM_EDIT_IMAGE__";
const IMAGE_HOST = "HOST";

interface Props {
  value: string;
  daemonId: string;
  onChange: (v: string) => void;
  onMethodChange?: (m: "SELECT" | "EDIT") => void;
  allowEmpty?: boolean;
  allowEmptyText?: string;
  allowHost?: boolean;
  allowHostText?: string;
  status?: "error";
}

export default function DockerImageSelect({ value, daemonId, onChange, onMethodChange, allowEmpty, allowEmptyText, allowHost, allowHostText, status }: Props) {
  const baseOptions = () =>
    [
      allowHost && { label: allowHostText ?? t("TXT_CODE_update_cmd_no_image"), value: IMAGE_HOST },
      allowEmpty && { label: allowEmptyText ?? t("TXT_CODE_79d4205"), value: "" },
      { label: t("TXT_CODE_435f4975"), value: IMAGE_EDIT }
    ].filter(Boolean) as { label: string; value: string }[];
  const [method, setMethod] = useState<"SELECT" | "EDIT">("SELECT");
  const [options, setOptions] = useState(baseOptions);
  const [loading, setLoading] = useState(false);

  const loadImages = async () => {
    setLoading(true);
    const next = baseOptions();
    try {
      const images = await imageList({ params: { daemonId }, method: "GET" });
      for (const image of images ?? []) {
        const tag = image?.RepoTags?.[0];
        if (tag) next.push({ label: tag, value: tag });
      }
    } catch {
      /* daemon without Docker: keep the base options */
    } finally {
      setOptions(next);
      setLoading(false);
    }
  };

  if (method === "EDIT") return <Input value={value} status={status} placeholder={t("TXT_CODE_d7638d7b")} onChange={(e) => onChange(e.target.value)} />;
  return (
    <Select
      value={value}
      size="large"
      style={{ width: "100%" }}
      status={status}
      placeholder={t("TXT_CODE_3bb646e4")}
      loading={loading}
      options={options}
      onFocus={() => void loadImages()}
      onChange={(v: string) => {
        if (v === IMAGE_EDIT) {
          onChange("");
          setMethod("EDIT");
          onMethodChange?.("EDIT");
          return;
        }
        onChange(v);
      }}
    />
  );
}
