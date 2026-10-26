/** Upload one image or audio file to the panel's public assets (port of components/fc/UploadFileDialog.vue). */
import { FolderOpenOutlined } from "@ant-design/icons";
import { Button, Modal, Upload } from "antd";
import { message } from "@/tools/antdStatic";
import { useRef, useState } from "react";
import { t } from "@/lang/i18n";
import { uploadAsset } from "@/services/apis/settings";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";
import "./UploadFileDialog.scss";

// Same lists the panel enforces in settings_router upload_assets.
export const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.ico";
export const AUDIO_ACCEPT = ".mp3,.ogg,.wav,.m4a,.flac,.aac";
/** Legacy HTML plugins; the panel serves them as plain text, the plugin host runs them sandboxed. */
export const PLUGIN_HTML_ACCEPT = ".html,.htm";

function UploadFileDialog({ done, accept }: { done: (path: string) => void; accept: string }) {
  const [open, setOpen] = useState(true);
  const [percent, setPercent] = useState(0);
  const abort = useRef(new AbortController());

  const finish = (path = "") => {
    setOpen(false);
    done(path);
  };

  const beforeUpload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await uploadAsset({
        data: form,
        forceRequest: true,
        signal: abort.current.signal,
        onUploadProgress: (e) => setPercent(e.total ? Math.round((e.loaded * 100) / e.total) : 0)
      });
      if (res) {
        message.success(t("TXT_CODE_773f36a0"));
        finish(`/upload_files/${res}`);
      } else {
        finish("");
      }
    } catch (error) {
      reportErrorMsg(error);
      setPercent(0);
    }
    return false;
  };

  const cancel = () => {
    abort.current.abort();
    finish();
  };

  return (
    <Modal open={open} title={t("TXT_CODE_e00c858c")} closable={false} destroyOnHidden width={400} onCancel={cancel} footer={null}>
      <div className="UploadFileDialog upload-container">
        <Upload maxCount={1} accept={accept} disabled={percent > 0} showUploadList={false} beforeUpload={(f) => beforeUpload(f as File)}>
          <Button type="primary" loading={percent > 0}>
            {percent === 0 && <FolderOpenOutlined />}
            {percent > 0 ? t("TXT_CODE_b625dbf0") + percent + "%" : t("TXT_CODE_335ba209")}
          </Button>
        </Upload>
        <Button className="ml-16" onClick={cancel}>
          {t("TXT_CODE_a0451c97")}
        </Button>
      </div>
    </Modal>
  );
}

/** Resolves with "/upload_files/<name>", or "" when cancelled. */
export function openUploadFileDialog(accept = IMAGE_ACCEPT): Promise<string> {
  return openDialog<string>((done) => <UploadFileDialog done={done} accept={accept} />);
}
