/**
 * Markdown text card (port of widgets/others/TextCard.vue): edited in design
 * mode, shown as rendered Markdown.
 *
 * SECURITY: rendered through markdownToHTML, the DOMPurify allow-list used
 * for login info (CWE-79).
 */
import { Button, Input } from "antd";
import { useState } from "react";
import CardPanel from "@/components/CardPanel";
import type { WidgetProps } from "@/config/widgets";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { t } from "@/lang/i18n";
import { useLayoutContainer } from "@/stores/layoutContainer";
import { markdownToHTML } from "@/tools/safe";

export default function TextCard({ card }: WidgetProps) {
  const { getMetaValue, setMetaValue } = useLayoutCardTools(card);
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const [text, setText] = useState(getMetaValue("textContent", ""));
  const [editing, setEditing] = useState(false);

  const preview = () => {
    setMetaValue("textContent", text);
    setEditing(false);
  };

  return (
    <CardPanel
      title={<div className="flex">{card.title}</div>}
      operator={
        isDesignMode ? (
          <div className="ml-10">
            {editing ? (
              <Button type="primary" size="small" onClick={preview}>
                {t("TXT_CODE_4d81a657")}
              </Button>
            ) : (
              <Button type="primary" size="small" onClick={() => setEditing(true)}>
                {t("TXT_CODE_ad207008")}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {isDesignMode && editing ? (
        <div className="edit h-100">
          <Input.TextArea value={text} className="h-100" style={{ resize: "none" }} placeholder={t("TXT_CODE_7ceebc05")} onChange={(e) => setText(e.target.value)} />
        </div>
      ) : (
        <div className="full-card-body-container">
          <div className="previews global-markdown-html h-100" dangerouslySetInnerHTML={{ __html: markdownToHTML(text) }} />
        </div>
      )}
    </CardPanel>
  );
}
