/**
 * Asks whether to install the Docker or the normal version of an app (port of
 * components/fc/DockerVersionSelectDialog.vue). Upstream ships it for the
 * market but does not open it yet; it is ported so a market flow can call it.
 *
 * Resolves with DOCKER_VERSION_CHOICE.NORMAL (1) or .DOCKER (2), the same
 * numbers upstream's dialog returns. The dialog cannot be dismissed without a
 * choice, as upstream.
 */
import { AppstoreOutlined, DeploymentUnitOutlined } from "@ant-design/icons";
import { Button, Card, Modal, Typography } from "antd";
import { useState } from "react";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import "./DockerVersionSelectDialog.scss";

export const DOCKER_VERSION_CHOICE = { NORMAL: 1, DOCKER: 2 } as const;
export type DockerVersionChoice = (typeof DOCKER_VERSION_CHOICE)[keyof typeof DOCKER_VERSION_CHOICE];

function DockerVersionSelectDialog({ done }: { done: (choice: DockerVersionChoice) => void }) {
  const [open, setOpen] = useState(true);
  const pick = (choice: DockerVersionChoice) => {
    setOpen(false);
    done(choice);
  };

  const card = (choice: DockerVersionChoice, icon: React.ReactNode, title: string, subtitle: string, btn: string, primary: boolean) => (
    <Card
      className="choose-card"
      hoverable
      onClick={() => pick(choice)}
      title={
        <div className="card-title">
          {icon}
          <span>{title}</span>
        </div>
      }
    >
      <Typography.Text type="secondary">{subtitle}</Typography.Text>
      <div className="card-action">
        <Button type={primary ? "primary" : "default"}>{btn}</Button>
      </div>
    </Card>
  );

  return (
    <Modal
      open={open}
      width={860}
      title={t("TXT_CODE_docker_version_select_title")}
      footer={null}
      destroyOnHidden
      closable={false}
      mask={{ closable: false }}
      keyboard={false}
    >
      <div className="DockerVersionSelectDialog">
        <Typography.Paragraph className="desc">{t("TXT_CODE_docker_version_select_desc")}</Typography.Paragraph>
        <div className="cards">
          {card(
            DOCKER_VERSION_CHOICE.DOCKER,
            <DeploymentUnitOutlined />,
            t("TXT_CODE_docker_version_select_docker_title"),
            t("TXT_CODE_docker_version_select_docker_subtitle"),
            t("TXT_CODE_docker_version_select_docker_btn"),
            true
          )}
          {card(
            DOCKER_VERSION_CHOICE.NORMAL,
            <AppstoreOutlined />,
            t("TXT_CODE_docker_version_select_normal_title"),
            t("TXT_CODE_docker_version_select_normal_subtitle"),
            t("TXT_CODE_docker_version_select_normal_btn"),
            false
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Opens the Docker/normal version choice; resolves with the choice. */
export function openDockerVersionSelectDialog(): Promise<DockerVersionChoice> {
  return openDialog<DockerVersionChoice>((done) => <DockerVersionSelectDialog done={done} />);
}
