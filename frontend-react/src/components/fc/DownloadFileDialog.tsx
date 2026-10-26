/**
 * "Download file from URL" prompt (port of components/fc/DownloadFileDialog.vue).
 * Collects a URL and a target file name; the daemon performs the download.
 *
 * SECURITY: only http(s) URLs are accepted here (upstream accepted any URL
 * the browser could parse, e.g. file: or ftp:). This is a usability check;
 * the enforcement point is the daemon (file_router download_from_url runs
 * checkSafeUrl: no IP literals, no local names, no private DNS answers).
 * SECURITY-WARNING: the daemon resolves the name again when it downloads, so
 * DNS rebinding between check and fetch remains possible (CWE-918, CWE-367).
 * TODO(security): pin the checked address for the actual request on the daemon.
 */
import { Button, Flex, Form, Input, Modal, Typography } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";
import type { DownloadFileConfigItem } from "@/types/fileManager";

const getFileNameFromUrl = (url: string): string | undefined => {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(last) || undefined;
  } catch {
    return undefined;
  }
};

function DownloadFileDialog({ done }: { done: (v?: DownloadFileConfigItem) => void }) {
  const [open, setOpen] = useState(true);
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");

  const close = (v?: DownloadFileConfigItem) => {
    setOpen(false);
    done(v);
  };

  const onUrlChange = (value: string) => {
    setUrl(value);
    const name = getFileNameFromUrl(value);
    if (name) setFileName(name);
  };

  const submit = () => {
    if (!url) return reportErrorMsg(t("TXT_CODE_b5095a15"));
    if (!fileName) return reportErrorMsg(t("TXT_CODE_de1b06cd"));
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return reportErrorMsg(t("TXT_CODE_a4a960b9"));
    }
    // SECURITY: http/https only (see header).
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return reportErrorMsg(t("TXT_CODE_a4a960b9"));
    close({ url, fileName });
  };

  return (
    <Modal
      open={open}
      title={t("TXT_CODE_f27b68b3")}
      closable={false}
      destroyOnHidden
      width={400}
      onCancel={() => close()}
      footer={[
        <Button key="c" onClick={() => close()}>
          {t("TXT_CODE_a0451c97")}
        </Button>,
        <Button key="o" type="primary" onClick={submit}>
          {t("TXT_CODE_d507abff")}
        </Button>
      ]}
    >
      <Form layout="vertical">
        <Form.Item label={t("TXT_CODE_ab8dd5a0")}>
          <Flex vertical gap={4}>
            <Typography.Text type="secondary" className="typography-text-ellipsis">
              {t("TXT_CODE_3fd7fe73")}
            </Typography.Text>
            <Input value={url} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => onUrlChange(e.target.value)} />
          </Flex>
        </Form.Item>
        <Form.Item label={t("TXT_CODE_2eace3d5")}>
          <Input value={fileName} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => setFileName(e.target.value)} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** Resolves with the URL and file name, or undefined when cancelled. */
export function openDownloadFileDialog(): Promise<DownloadFileConfigItem | undefined> {
  return openDialog<DownloadFileConfigItem | undefined>((done) => <DownloadFileDialog done={done} />);
}
