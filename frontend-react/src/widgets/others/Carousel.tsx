/**
 * Image carousel card (port of widgets/others/Carousel.vue): several
 * pictures, each set by URL or upload, rotating automatically.
 *
 * SECURITY: every URL passes safeHttpUrl before it is stored or shown;
 * uploads go through the panel's image allow-list.
 */
import { CloseOutlined, LeftCircleOutlined, MinusCircleOutlined, PlusOutlined, RightCircleOutlined, UploadOutlined } from "@ant-design/icons";
import { Button, Carousel as AntCarousel, Empty, Form, Input, Modal, Tooltip, Upload } from "antd";
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
import "./Carousel.scss";

interface ImgItem {
  url: string;
  key: number;
  uploadPercent: number;
}

const clean = (list: unknown): ImgItem[] =>
  Array.isArray(list)
    ? list.filter((i) => i && typeof i.url === "string").map((i, n) => ({ url: i.url, key: Number(i.key) || n, uploadPercent: 0 }))
    : [];

export default function Carousel({ card }: WidgetProps) {
  const { getMetaValue, setMetaValue } = useLayoutCardTools(card);
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const isAdmin = useIsAdmin();
  const [imgList, setImgList] = useState<ImgItem[]>(() => clean(getMetaValue("images", [])));
  const [display, setDisplay] = useState<ImgItem[]>(imgList);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<number, boolean>>({});
  const controls = useRef(new Map<number, AbortController>());
  const shown = display.map((i) => safeHttpUrl(i.url)).filter((u): u is string => !!u);

  const patch = (key: number, p: Partial<ImgItem>) => setImgList((l) => l.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const beforeUpload = async (file: File, item: ImgItem) => {
    const ctrl = new AbortController();
    controls.current.set(item.key, ctrl);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await uploadAsset({
        data: form,
        forceRequest: true,
        timeout: 0,
        signal: ctrl.signal,
        onUploadProgress: (e) => patch(item.key, { uploadPercent: e.total ? Math.max(1, Math.round((e.loaded * 100) / e.total)) : 1 })
      });
      if (res) {
        patch(item.key, { url: `/upload_files/${res}`, uploadPercent: 0 });
        message.success(t("TXT_CODE_773f36a0"));
      }
    } catch (err) {
      patch(item.key, { uploadPercent: 0 });
      if (!ctrl.signal.aborted) reportErrorMsg(err);
    }
    return false;
  };

  const cancelUpload = (item: ImgItem) => {
    controls.current.get(item.key)?.abort();
    patch(item.key, { uploadPercent: 0 });
  };

  const close = () => {
    imgList.forEach(cancelUpload);
    setImgList(display);
    setOpen(false);
  };

  const save = () => {
    const bad: Record<number, boolean> = {};
    imgList.forEach((i) => {
      if (!i.url.trim() || !safeHttpUrl(i.url)) bad[i.key] = true;
    });
    setErrors(bad);
    if (Object.keys(bad).length) return reportErrorMsg(t("TXT_CODE_c8a51b2e"));
    const list = imgList.map((i) => ({ ...i, url: i.url.trim(), uploadPercent: 0 }));
    setMetaValue("images", list);
    setDisplay(list);
    setOpen(false);
  };

  const edit = () => {
    setImgList(display.length ? display : [{ url: "", key: Date.now(), uploadPercent: 0 }]);
    setErrors({});
    setOpen(true);
  };

  return (
    <>
      <div className="CarouselCard" style={{ width: "100%", height: "100%", position: "relative" }}>
        {shown.length !== 0 && (
          <AntCarousel
            className="h-100"
            arrows
            autoplay
            adaptiveHeight={false}
            prevArrow={
              <div className="custom-slick-arrow" style={{ left: 10, zIndex: 1 }}>
                <LeftCircleOutlined />
              </div>
            }
            nextArrow={
              <div className="custom-slick-arrow" style={{ right: 10 }}>
                <RightCircleOutlined />
              </div>
            }
          >
            {shown.map((url, n) => (
              <div key={url + n} className="h-100">
                <img src={url} style={{ height: "100%" }} alt="" referrerPolicy="no-referrer" />
              </div>
            ))}
          </AntCarousel>
        )}
        {shown.length !== 0 && isDesignMode && (
          <div className="mask" style={{ zIndex: 10 }}>
            <Button type="primary" onClick={edit}>
              {t("TXT_CODE_fd13f431")}
            </Button>
          </div>
        )}
        {shown.length === 0 && (
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
        title={t("TXT_CODE_4a56836d")}
        closable={false}
        destroyOnHidden
        onCancel={close}
        footer={
          <>
            <Button onClick={close}>{t("TXT_CODE_b1dedda3")}</Button>
            <Button type="primary" onClick={save}>
              {t("TXT_CODE_abfe9512")}
            </Button>
          </>
        }
      >
        <Form className="mt-20" labelCol={{ xs: { span: 24 }, sm: { span: 4 } }} wrapperCol={{ xs: { span: 24 }, sm: { span: 20 } }}>
          {imgList.map((item, index) => (
            <Form.Item
              key={item.key}
              label={`${t("TXT_CODE_9900f79e")} ${index + 1}`}
              required
              validateStatus={errors[item.key] ? "error" : undefined}
              help={errors[item.key] ? t("TXT_CODE_c8a51b2e") : undefined}
            >
              <div style={{ display: "inline-flex", width: "80%" }}>
                {item.uploadPercent === 0 ? (
                  <>
                    <Input value={item.url} placeholder={t("TXT_CODE_c8a51b2e")} onChange={(e) => patch(item.key, { url: e.target.value })} />
                    <Upload maxCount={1} accept={IMAGE_ACCEPT} showUploadList={false} beforeUpload={(f) => beforeUpload(f as File, item)} className="mr-8">
                      <Button type="link" icon={<UploadOutlined />} />
                    </Upload>
                  </>
                ) : (
                  <>
                    <Input value={`${t("TXT_CODE_b625dbf0") + item.uploadPercent}%`} disabled />
                    <Tooltip title={t("TXT_CODE_7ec87e8a")}>
                      <Button type="link" icon={<CloseOutlined />} onClick={() => cancelUpload(item)} />
                    </Tooltip>
                  </>
                )}
              </div>
              {imgList.length > 1 && (
                <Button type="link" icon={<MinusCircleOutlined />} onClick={() => setImgList((l) => l.filter((i) => i.key !== item.key))} />
              )}
            </Form.Item>
          ))}
          <Form.Item wrapperCol={{ xs: { span: 24, offset: 0 }, sm: { span: 20, offset: 4 } }}>
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => setImgList((l) => [...l, { url: "", key: Date.now(), uploadPercent: 0 }])}>
              {t("TXT_CODE_589e091c")}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
