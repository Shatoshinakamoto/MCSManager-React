/**
 * Link list card (port of widgets/others/LinkCard.vue).
 *
 * SECURITY: only http(s) or same-origin links are saved or opened, and they
 * open with noopener,noreferrer (CWE-79 via javascript: URLs, CWE-1022).
 */
import { DeleteOutlined } from "@ant-design/icons";
import { Button, Input, Modal, Popconfirm, Row } from "antd";
import { useState } from "react";
import ActionButton from "@/components/ActionButton";
import CardPanel from "@/components/CardPanel";
import type { WidgetProps } from "@/config/widgets";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { t } from "@/lang/i18n";
import { useLayoutContainer } from "@/stores/layoutContainer";
import { message } from "@/tools/antdStatic";
import { safeHttpUrl } from "@/tools/safeUrl";
import { reportErrorMsg } from "@/tools/validator";
import "./LinkCard.scss";

interface LinkItem {
  title: string;
  link: string;
}

export default function LinkCard({ card }: WidgetProps) {
  const { getMetaValue, setMetaValue } = useLayoutCardTools(card);
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const [links, setLinks] = useState<LinkItem[]>(() => {
    const v = getMetaValue<unknown>("linkCardData", [{ title: t("TXT_CODE_458c34db"), link: "https://example.com/" }]);
    return Array.isArray(v) ? v.filter((i) => i && typeof i.title === "string" && typeof i.link === "string") : [];
  });
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState({ title: "", link: "" });

  const close = () => {
    setDraft({ title: "", link: "" });
    setShow(false);
  };

  const finish = () => {
    if (draft.title === "" || draft.link === "") return reportErrorMsg(t("TXT_CODE_633415e2"));
    if (!safeHttpUrl(draft.link)) return reportErrorMsg(t("TXT_CODE_SAFE_URL_ONLY"));
    const next = [...links, { title: draft.title, link: draft.link.trim() }];
    setLinks(next);
    setMetaValue("linkCardData", next);
    message.success(t("TXT_CODE_db14fb46"));
    close();
  };

  const remove = (index: number) => {
    const next = links.filter((_, i) => i !== index);
    setLinks(next);
    setMetaValue("linkCardData", next);
  };

  const openLink = (url: string) => {
    const safe = safeHttpUrl(url);
    if (safe) window.open(safe, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <CardPanel
        title={<div className="flex">{card.title}</div>}
        operator={
          isDesignMode ? (
            <div className="btn-group ml-10">
              <Button type="primary" size="small" onClick={() => setShow(true)}>
                {t("TXT_CODE_a1d885c1")}
              </Button>
            </div>
          ) : undefined
        }
      >
        <Row gutter={[0, 16]}>
          {links.map((item, index) => (
            <div key={item.title + index} className="LinkCard h-100 w-100 button">
              {isDesignMode && (
                <Popconfirm title={t("TXT_CODE_6f12aba3")} okText={t("TXT_CODE_d507abff")} cancelText={t("TXT_CODE_a0451c97")} onConfirm={() => remove(index)}>
                  <div className="delete-button">
                    <DeleteOutlined />
                  </div>
                </Popconfirm>
              )}
              <ActionButton title={item.title} click={() => openLink(item.link)} />
            </div>
          ))}
        </Row>
      </CardPanel>
      <Modal open={show} title={t("TXT_CODE_a7c85e67")} onOk={finish} onCancel={close}>
        <Input.TextArea value={draft.title} placeholder={t("TXT_CODE_b5a0661a")} autoSize className="mt-10 mb-10" onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
        <Input.TextArea value={draft.link} placeholder={t("TXT_CODE_ad5e2b0f")} autoSize onChange={(e) => setDraft((d) => ({ ...d, link: e.target.value }))} />
      </Modal>
    </>
  );
}
