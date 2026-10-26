/**
 * Image card (port of widgets/others/ImageBox.vue): one picture, set in
 * design mode by upload or URL.
 *
 * SECURITY: the stored URL passes safeHttpUrl (http(s) or a same-origin
 * path), so a layout cannot point the image at javascript: or data: URLs.
 * Uploads go through the panel's image allow-list (upload_assets).
 */
import { UploadOutlined } from "@ant-design/icons";
import { Button, Empty, Input, Modal, Progress, Tabs, Typography, Upload } from "antd";
import { useRef, useState } from "react";
import CardPanel from "@/components/CardPanel";
import { IMAGE_ACCEPT } from "@/components/fc/UploadFileDialog";
import type { WidgetProps } from "@/config/widgets";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { t } from "@/lang/i18n";
import { uploadAsset } from "@/services/apis/settings";
import { useIsAdmin } from "@/stores/appState";
import { useLayoutContainer } from "@/stores/layoutContainer";
import { message } from "@/tools/antdStatic";
import { safeHttpUrl } from "@/tools/safeUrl";
import { reportErrorMsg } from "@/tools/validator";
import "./ImageBox.scss";

export default function ImageBox({ card }: WidgetProps) {
  const { getMetaValue, setMetaValue } = useLayoutCardTools(card);
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const isAdmin = useIsAdmin();
  const [imgSrc, setImgSrc] = useState(getMetaValue("image", ""));
  const [draft, setDraft] = useState(imgSrc);
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState("upload");
  const [percent, setPercent] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const shown = safeHttpUrl(imgSrc);

  const apply = (url: string) => {
    setImgSrc(url);
    setMetaValue("image", url);
  };

  const beforeUpload = async (file: File) => {
    abort.current = new AbortController();
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await uploadAsset({
        data: form,
        forceRequest: true,
        timeout: 0,
        signal: abort.current.signal,
        onUploadProgress: (e) => setPercent(e.total ? Math.round((e.loaded * 100) / e.total) : 0)
      });
      if (res) {
        apply(`/upload_files/${res}`);
        message.success(t("TXT_CODE_773f36a0"));
        setOpen(false);
      }
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setPercent(0);
    }
    return false;
  };

  const save = () => {
    const url = draft.trim();
    if (url && !safeHttpUrl(url)) return reportErrorMsg(t("TXT_CODE_SAFE_URL_ONLY"));
    apply(url);
    setOpen(false);
  };

  const close = () => {
    if (percent !== 0) abort.current?.abort();
    setPercent(0);
    setOpen(false);
  };

  const edit = () => {
    setDraft(imgSrc);
    setOpen(true);
  };

  return (
    <>
      <div className="ImageBox" style={{ width: "100%", height: "100%", position: "relative" }}>
        {shown && isDesignMode && (
          <div className="mask">
            <Button type="primary" onClick={edit}>
              {t("TXT_CODE_fd13f431")}
            </Button>
          </div>
        )}
        {shown ? (
          <img className="global-card-container-shadow" src={shown} alt="" referrerPolicy="no-referrer" />
        ) : (
          <CardPanel style={{ height: "100%" }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span>{t("TXT_CODE_635d051")}</span>}>
              <Button disabled={!isDesignMode || !isAdmin} type="primary" onClick={edit}>
                {t("TXT_CODE_589e091c")}
              </Button>
            </Empty>
          </CardPanel>
        )}
      </div>
      <Modal
        open={open}
        title={null}
        closable={false}
        destroyOnHidden
        onCancel={close}
        footer={
          <>
            <Button onClick={close}>{t("TXT_CODE_b1dedda3")}</Button>
            {activeKey === "url" && (
              <Button type="primary" onClick={save}>
                {t("TXT_CODE_abfe9512")}
              </Button>
            )}
          </>
        }
      >
        <Tabs
          activeKey={activeKey}
          onChange={setActiveKey}
          items={[
            {
              key: "upload",
              label: t("TXT_CODE_e00c858c"),
              children: (
                <>
                  {percent > 0 && <Progress strokeColor={{ "0%": "#49b3ff", "100%": "#25f5b9" }} percent={percent} className="mb-20" />}
                  <Upload maxCount={1} accept={IMAGE_ACCEPT} disabled={percent > 0} showUploadList={false} beforeUpload={(f) => beforeUpload(f as File)}>
                    <Button type="primary" loading={percent > 0} icon={percent === 0 ? <UploadOutlined /> : undefined}>
                      {percent > 0 ? t("TXT_CODE_b625dbf0") + percent + "%" : t("TXT_CODE_e00c858c")}
                    </Button>
                  </Upload>
                  <Typography className="mt-20">
                    <Typography.Title level={5}>{t("TXT_CODE_e112412a")}</Typography.Title>
                    <Typography.Paragraph>
                      <ol>
                        <li>{t("TXT_CODE_2bcc4e34")}</li>
                        <li>{t("TXT_CODE_498cd5c5")}</li>
                        <li>{t("TXT_CODE_c1320e08")}</li>
                      </ol>
                    </Typography.Paragraph>
                  </Typography>
                </>
              )
            },
            {
              key: "url",
              label: t("TXT_CODE_ba42d467"),
              forceRender: true,
              children: <Input value={draft} autoFocus placeholder={t("TXT_CODE_c8a51b2e")} onChange={(e) => setDraft(e.target.value)} />
            }
          ]}
        />
      </Modal>
    </>
  );
}
