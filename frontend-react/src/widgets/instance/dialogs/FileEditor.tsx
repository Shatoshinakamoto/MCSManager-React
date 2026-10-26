/**
 * Text file editor dialog (port of widgets/instance/dialogs/FileEditor.vue).
 * Loads the file through the panel, edits it in CodeMirror, saves on OK or
 * Ctrl+S. Full-screen toggle on desktop; always full screen on phones.
 *
 * The file text is shown inside CodeMirror, which renders it as text, never
 * as HTML.
 */
import { FullscreenExitOutlined, FullscreenOutlined } from "@ant-design/icons";
import { App, Button, Modal, Skeleton } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@/components/Editor";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { fileContent } from "@/services/apis/fileManager";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";
import "./FileEditor.scss";

interface Props {
  daemonId: string;
  instanceId: string;
  path: string;
  fileName: string;
  onSave?: () => void;
  done: () => void;
}

function FileEditor({ daemonId, instanceId, path, fileName, onSave, done }: Props) {
  const { message } = App.useApp();
  const { isPhone } = useScreen();
  const [open, setOpen] = useState(true);
  const [fullScreen, setFullScreen] = useState(isPhone);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialText, setInitialText] = useState("");
  const text = useRef("");

  useEffect(() => {
    let cancelled = false;
    fileContent({ forceRequest: true, params: { daemonId, uuid: instanceId }, data: { target: path } })
      .then((res) => {
        if (cancelled) return;
        // The daemon returns `true` (not a string) for an empty file.
        const value = typeof res === "string" ? res : "";
        text.current = value;
        setInitialText(value);
        setLoaded(true);
      })
      .catch((err) => !cancelled && reportErrorMsg(err));
    return () => {
      cancelled = true;
    };
  }, [daemonId, instanceId, path]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fileContent({ forceRequest: true, params: { daemonId, uuid: instanceId }, data: { target: path, text: text.current } });
      return true;
    } catch (err) {
      reportErrorMsg(err);
      return false;
    } finally {
      setSaving(false);
    }
  }, [daemonId, instanceId, path]);

  // Ctrl+S saves without closing, as upstream does.
  useEffect(() => {
    if (!open || !loaded) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      void save().then((ok) => {
        if (!ok) return;
        message.success(t("TXT_CODE_8f47d95"));
        onSave?.();
      });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loaded, save, message, onSave]);

  const close = () => {
    setOpen(false);
    done();
  };

  const submit = async () => {
    if (!loaded) return close();
    if (!(await save())) return;
    message.success(t("TXT_CODE_a7907771"));
    onSave?.();
    close();
  };

  return (
    <Modal
      open={open}
      centered
      wrapClassName={fullScreen ? "full-modal" : ""}
      cancelText={t("TXT_CODE_3b1cc020")}
      okText={t("TXT_CODE_abfe9512")}
      mask={{ closable: false }}
      width={fullScreen ? "100%" : 1600}
      confirmLoading={saving}
      onOk={submit}
      onCancel={close}
      title={
        <>
          {fileName}
          {!isPhone && (
            <Button type="text" size="small" icon={fullScreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={() => setFullScreen(!fullScreen)} />
          )}
        </>
      }
    >
      {loaded ? (
        <Editor text={initialText} filename={fileName} height={fullScreen ? "100%" : "60vh"} onChange={(v) => (text.current = v)} />
      ) : (
        <Skeleton paragraph={{ rows: 12 }} active />
      )}
    </Modal>
  );
}

/** Open `path` in the editor; onSave runs after each successful save. */
export function openFileEditor(opts: Omit<Props, "done">): Promise<void> {
  return openDialog<void>((done) => <FileEditor {...opts} done={() => done()} />);
}
