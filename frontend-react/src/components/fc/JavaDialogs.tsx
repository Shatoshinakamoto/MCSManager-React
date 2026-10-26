/**
 * "Add Java" and "Download Java" pickers (port of components/fc/AddJavaDialog.vue
 * and DownloadJavaDialog.vue). Both resolve with the chosen item or undefined.
 * The daemon validates the path / version; these dialogs only collect input.
 */
import { Button, Card, Flex, Form, Image, Input, Modal, Tag, Typography } from "antd";
import { useState } from "react";
import JavaIcon from "@/assets/components/java.png";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import type { AddJavaConfigItem, DownloadJavaConfigItem } from "@/types/javaManager";
import "./JavaDialogs.scss";

const JAVA_OPTIONS: DownloadJavaConfigItem[] = ["8", "11", "15", "17", "21", "25"].map((version) => ({ name: "zulu", version }));

function AddJavaDialog({ done }: { done: (v?: AddJavaConfigItem) => void }) {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<AddJavaConfigItem>({ name: "", path: "" });
  const finish = (v?: AddJavaConfigItem) => {
    setOpen(false);
    done(v);
  };
  return (
    <Modal
      open={open}
      width={400}
      centered
      title={t("TXT_CODE_8900e7ee")}
      closable={false}
      destroyOnHidden
      onCancel={() => finish()}
      footer={[
        <Button key="c" onClick={() => finish()}>
          {t("TXT_CODE_a0451c97")}
        </Button>,
        <Button key="ok" type="primary" onClick={() => finish(data)}>
          {t("TXT_CODE_d507abff")}
        </Button>
      ]}
    >
      <Form layout="vertical">
        <Form.Item label={t("TXT_CODE_3f36206f")}>
          <Input value={data.name} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))} />
        </Form.Item>
        <Form.Item label={t("TXT_CODE_43422ed3")}>
          <Input value={data.path} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => setData((d) => ({ ...d, path: e.target.value }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function DownloadJavaDialog({ done }: { done: (v?: DownloadJavaConfigItem) => void }) {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const finish = (v?: DownloadJavaConfigItem) => {
    setOpen(false);
    done(v);
  };
  return (
    <Modal
      open={open}
      width={820}
      centered
      title={t("TXT_CODE_84588601")}
      closable={false}
      destroyOnHidden
      onCancel={() => finish()}
      footer={[
        <Button key="c" onClick={() => finish()}>
          {t("TXT_CODE_a0451c97")}
        </Button>,
        <Button key="ok" type="primary" disabled={selected === null} onClick={() => finish(selected === null ? undefined : JAVA_OPTIONS[selected])}>
          {t("TXT_CODE_d507abff")}
        </Button>
      ]}
    >
      <Flex wrap="wrap" gap="middle" justify="flex-start">
        {JAVA_OPTIONS.map((item, index) => (
          <Card
            key={`${item.name}-${item.version}`}
            hoverable
            className={["java-card", selected === index ? "java-card-selected" : ""].filter(Boolean).join(" ")}
            onClick={() => setSelected(index)}
            cover={
              <div className="java-card-cover">
                <Image src={JavaIcon} preview={false} height={62} style={{ objectFit: "cover", borderRadius: 0 }} />
              </div>
            }
          >
            <Card.Meta
              title={<Typography.Text strong> Java {item.version.toUpperCase()}</Typography.Text>}
              description={<Tag color="blue">{item.name.toUpperCase()}</Tag>}
            />
          </Card>
        ))}
      </Flex>
    </Modal>
  );
}

export const openAddJavaDialog = () => openDialog<AddJavaConfigItem | undefined>((done) => <AddJavaDialog done={done} />);
export const openDownloadJavaDialog = () => openDialog<DownloadJavaConfigItem | undefined>((done) => <DownloadJavaDialog done={done} />);
