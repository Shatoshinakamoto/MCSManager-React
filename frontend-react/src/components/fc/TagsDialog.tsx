/** Instance tag editor (port of components/fc/TagsDialog.vue). Resolves with the tags after save or cancel. */
import { PlusOutlined } from "@ant-design/icons";
import { Input, message, Modal, Tag, Typography, type InputRef } from "antd";
import { useEffect, useRef, useState } from "react";
import { useInstanceTags, useInstanceTagTips } from "@/hooks/useInstanceTag";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";
import "./TagsDialog.scss";

interface Props {
  instanceId: string;
  daemonId: string;
  tags: string[];
  done: (tags: string[]) => void;
}

function TagsDialog({ instanceId, daemonId, tags, done }: Props) {
  const tagTips = useInstanceTagTips((s) => s.tagTips);
  const { removeTag, addTag, instanceTags, saveTags, saveLoading, instanceTagsTips } = useInstanceTags(instanceId, daemonId, tags, tagTips);
  const [open, setOpen] = useState(true);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (inputVisible) inputRef.current?.focus();
  }, [inputVisible]);

  const handleInputConfirm = () => {
    if (inputValue) addTag(inputValue);
    setInputVisible(false);
    setInputValue("");
  };

  // Upstream resolves with the edited list on cancel too; callers compare it with the original.
  const cancel = () => {
    setOpen(false);
    done(instanceTags);
  };

  const submit = async () => {
    try {
      await saveTags();
      message.success(t("TXT_CODE_a7907771"));
      cancel();
    } catch (error) {
      reportErrorMsg(error);
    }
  };

  return (
    <Modal open={open} title={t("TXT_CODE_a2544278")} centered confirmLoading={saveLoading} onOk={submit} onCancel={cancel}>
      <div className="TagsDialog dialog-overflow-container">
        <div className="flex direction-column">
          <Typography.Paragraph>
            <Typography.Text type="secondary">{t("TXT_CODE_f84ae54f")}</Typography.Text>
          </Typography.Paragraph>
          <div>
            <Typography.Paragraph>
              <Typography.Text>{t("TXT_CODE_2c1337d")}</Typography.Text>
            </Typography.Paragraph>
            <Typography.Paragraph>
              <Typography.Text type="secondary">{t("TXT_CODE_e26d53d5")}</Typography.Text>
            </Typography.Paragraph>
            <div className="tag-container">
              {instanceTags.map((tag) => (
                <Tag key={tag} className="m-4 my-tag" color="blue" closable onClose={() => removeTag(tag)}>
                  {tag}
                </Tag>
              ))}
              {inputVisible ? (
                <Input
                  ref={inputRef}
                  value={inputValue}
                  size="small"
                  style={{ width: 82 }}
                  className="m-4"
                  maxLength={20} // panel rejects tags over 20 characters (instance_operate_router)
                  onChange={(e) => setInputValue(e.target.value)}
                  onBlur={handleInputConfirm}
                  onPressEnter={handleInputConfirm}
                />
              ) : (
                <Tag className="m-4 my-tag" style={{ borderStyle: "dashed", cursor: "pointer" }} onClick={() => setInputVisible(true)}>
                  <PlusOutlined /> {t("TXT_CODE_3dd66d98")}
                </Tag>
              )}
            </div>
          </div>

          {instanceTagsTips.length > 0 && (
            <div className="mt-20">
              <Typography.Paragraph>
                <Typography.Text>{t("TXT_CODE_67d1ea21")}</Typography.Text>
              </Typography.Paragraph>
              <Typography.Paragraph>
                <Typography.Text type="secondary">{t("TXT_CODE_3ecee271")}</Typography.Text>
              </Typography.Paragraph>
              <div className="tag-container">
                {instanceTagsTips.map((tag) => (
                  <Tag key={tag} className="m-4 my-tag tag-option" onClick={() => addTag(tag)}>
                    {tag}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Open the tag editor; resolves with the resulting tag list. */
export function openInstanceTagsEditor(instanceId: string, daemonId: string, tags: string[]): Promise<string[]> {
  return openDialog<string[]>((done) => <TagsDialog instanceId={instanceId} daemonId={daemonId} tags={tags} done={done} />);
}
