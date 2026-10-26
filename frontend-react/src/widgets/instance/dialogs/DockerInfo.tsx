/** Read-only view of an instance's Docker settings (port of dialogs/DockerInfo.vue). */
import { Descriptions, Modal, Tag, type DescriptionsProps } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import { dockerPortsArray } from "@/tools/common";

function DockerInfoDialog({ dockerInfo, done }: { dockerInfo?: IGlobalInstanceDockerConfig; done: (v: void) => void }) {
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    done();
  };
  const items: NonNullable<DescriptionsProps["items"]> = [
    { key: "memory", label: t("TXT_CODE_dd238854"), children: `${dockerInfo?.memory ?? ""}MB` },
    { key: "network", label: t("TXT_CODE_efcef926"), children: dockerInfo?.networkMode },
    { key: "image", label: t("TXT_CODE_77000411"), children: dockerInfo?.image },
    { key: "name", label: t("TXT_CODE_c3a3b6b1"), children: dockerInfo?.containerName }
  ];
  if (dockerInfo?.ports) {
    items.push({
      key: "ports",
      label: t("TXT_CODE_d32301c1"),
      children: (
        <div>
          {dockerPortsArray(dockerInfo.ports).map((item, index) => (
            <div key={index} style={{ marginBottom: 2 }}>
              <span>
                {t("TXT_CODE_8dfc41ef")}: {item.host}
              </span>
              <span style={{ marginLeft: 6 }}>
                {t("TXT_CODE_8f8103b7")}: {item.container}
              </span>
              <span style={{ marginLeft: 8 }}>
                <Tag color="green">{String(item.protocol ?? "").toUpperCase()}</Tag>
              </span>
            </div>
          ))}
        </div>
      )
    });
  }
  return (
    <Modal open={open} centered title={t("TXT_CODE_a7f6b0e0")} onOk={close} onCancel={close}>
      <Descriptions column={{ md: 2, sm: 2, xs: 1 }} items={items} />
    </Modal>
  );
}

export const openDockerInfoDialog = (dockerInfo?: IGlobalInstanceDockerConfig) =>
  openDialog<void>((done) => <DockerInfoDialog dockerInfo={dockerInfo} done={done} />);
