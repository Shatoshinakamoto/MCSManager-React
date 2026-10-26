/**
 * Image preview for the file manager (port of widgets/instance/dialogs/ImageViewer.vue).
 *
 * The daemon download link is single-use, so the image is fetched once into
 * a blob URL that both the thumbnail and antd's zoom preview read. The
 * Download button asks for a fresh link.
 */
import { Button, Image, Modal, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { requestFileLink } from "@/hooks/useFileManager";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";

interface Props {
  instanceId: string;
  daemonId: string;
  fileName: string;
  frontDir: string;
  done: () => void;
}

function ImageViewer({ instanceId, daemonId, fileName, frontDir, done }: Props) {
  const [open, setOpen] = useState(true);
  const [src, setSrc] = useState("");
  const [downloading, setDownloading] = useState(false);
  const blobUrl = useRef("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const link = await requestFileLink(instanceId, daemonId, fileName, frontDir);
        if (!link || cancelled) return;
        try {
          // SECURITY: no credentials are sent; the one-time password in the URL authorizes it.
          const res = await fetch(link, { credentials: "omit" });
          if (!res.ok) throw new Error(String(res.status));
          const url = URL.createObjectURL(await res.blob());
          if (cancelled) return URL.revokeObjectURL(url);
          blobUrl.current = url;
          setSrc(url);
        } catch {
          if (!cancelled) setSrc(link);
        }
      } catch (err) {
        reportErrorMsg(err);
      }
    })();
    return () => {
      cancelled = true;
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = "";
    };
  }, [instanceId, daemonId, fileName, frontDir]);

  const close = () => {
    setOpen(false);
    done();
  };

  const download = async () => {
    setDownloading(true);
    try {
      const link = await requestFileLink(instanceId, daemonId, fileName, frontDir);
      if (link) window.open(link, "_blank", "noopener");
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t("TXT_CODE_eee2a47f")}
      onCancel={close}
      footer={
        <Button type="primary" loading={downloading} onClick={download}>
          {t("TXT_CODE_65b21404")}
        </Button>
      }
    >
      <div style={{ marginBottom: 10, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Spin spinning={!src}>{src ? <Image src={src} /> : <div style={{ width: 100, height: 100 }} />}</Spin>
      </div>
      <div style={{ textAlign: "center" }}>{fileName}</div>
    </Modal>
  );
}

export function openImageViewerDialog(instanceId: string, daemonId: string, fileName: string, frontDir: string): Promise<void> {
  return openDialog<void>((done) => <ImageViewer instanceId={instanceId} daemonId={daemonId} fileName={fileName} frontDir={frontDir} done={() => done()} />);
}
