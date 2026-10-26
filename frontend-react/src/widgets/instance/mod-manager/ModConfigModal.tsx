/** Config files of one mod (port of mod-manager/ModConfigModal.vue). */
import { FileTextOutlined } from "@ant-design/icons";
import { Button, List, Modal } from "antd";
import { t } from "@/lang/i18n";
import type { LocalMod } from "./types";

export interface ModConfigFile {
  name: string;
  path: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  currentMod: LocalMod | null;
  configLoading: boolean;
  configFiles: ModConfigFile[];
  onEdit: (f: ModConfigFile) => void;
}

export default function ModConfigModal({ visible, onClose, currentMod, configLoading, configFiles, onEdit }: Props) {
  return (
    <Modal open={visible} title={t("TXT_CODE_CONFIG") + ": " + (currentMod?.name ?? "")} footer={null} onCancel={onClose}>
      <List
        loading={configLoading}
        dataSource={configFiles}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button key="edit" type="link" onClick={() => onEdit(item)}>
                {t("TXT_CODE_EDIT")}
              </Button>
            ]}
          >
            <List.Item.Meta avatar={<FileTextOutlined />} title={item.name} description={item.path} />
          </List.Item>
        )}
      />
    </Modal>
  );
}
