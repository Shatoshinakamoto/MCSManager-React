/**
 * Create-image page (port of widgets/imageManager/NewImage.vue, with
 * DockerFileForm.vue and BuildProgress.vue): pick a Dockerfile template, edit
 * it, and ask the daemon to build it; a dialog shows build progress.
 *
 * Security: the Dockerfile is built by the daemon's Docker engine, so this is
 * an admin-only, code-execution-level feature; the panel route requires admin
 * (or web admin, when that role is enforced). Image name and tag are checked
 * here only for emptiness; Docker validates them.
 */
import { App, Button, Col, Drawer, Form, Input, Modal, Popconfirm, Row, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import BetweenMenus from "@/components/BetweenMenus";
import CardPanel from "@/components/CardPanel";
import Loading from "@/components/Loading";
import type { WidgetProps } from "@/config/widgets";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useScreen } from "@/hooks/useScreen";
import { getCurrentLang, t } from "@/lang/i18n";
import { buildProgress, imageList } from "@/services/apis/envImage";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";
import {
  defaultDockerfile,
  jdk17Dockerfile,
  jdk17DockerfileCN,
  jdk8Dockerfile,
  jdk8DockerfileCN,
  ubuntu22Dockerfile,
  ubuntu22DockerfileCN
} from "@/types/instanceDefaults";
import "./NewImage.scss";

interface Template {
  dockerFile: string;
  name: string;
  version: string;
}

function templateFor(type: number): Template | undefined {
  const zh = getCurrentLang() === "zh_cn";
  switch (type) {
    case 1:
      return { dockerFile: zh ? jdk8DockerfileCN : jdk8Dockerfile, name: "mcsm-eclipse-temurin", version: "8" };
    case 2:
      return { dockerFile: zh ? jdk17DockerfileCN : jdk17Dockerfile, name: "mcsm-eclipse-temurin", version: "17" };
    case 3:
      return { dockerFile: zh ? ubuntu22DockerfileCN : ubuntu22Dockerfile, name: "mcsm-ubuntu", version: "22.04" };
    case 4:
      return { dockerFile: defaultDockerfile, name: "mcsm-custom", version: "latest" };
    default:
      return undefined;
  }
}

function DockerFileForm({ initial, daemonId, onClose }: { initial: Template; daemonId: string; onClose: () => void }) {
  const { notification } = App.useApp();
  const [opts, setOpts] = useState(initial);
  const submit = async () => {
    if (!opts.dockerFile || !opts.name || !opts.version) return reportErrorMsg(t("TXT_CODE_2764f197"));
    try {
      await imageList({
        params: { daemonId },
        data: { dockerFile: opts.dockerFile, name: opts.name, tag: opts.version },
        method: "POST"
      });
      notification.info({ title: t("TXT_CODE_55edf44d"), description: t("TXT_CODE_b340c04a") });
      onClose();
    } catch (err) {
      reportErrorMsg(err);
    }
  };
  return (
    <>
      <Typography>
        <Typography.Paragraph>
          <Typography.Title level={5}>{t("TXT_CODE_868df02c")}</Typography.Title>
          <Typography.Text>{t("TXT_CODE_77d93d7d")}</Typography.Text>
        </Typography.Paragraph>
        <Typography.Paragraph>
          <Typography.Title level={5}>{t("TXT_CODE_ef0ce2e")}</Typography.Title>
          <Typography.Text>{t("TXT_CODE_5024d817")}</Typography.Text>
        </Typography.Paragraph>
      </Typography>
      <Form.Item>
        <Input.TextArea value={opts.dockerFile} rows={8} onChange={(e) => setOpts({ ...opts, dockerFile: e.target.value })} />
      </Form.Item>
      <Form.Item>
        <Typography.Text>{t("TXT_CODE_7cf078e8")}</Typography.Text>
        <Space.Compact style={{ width: "100%" }}>
          <Input value={opts.name} style={{ width: "65%" }} onChange={(e) => setOpts({ ...opts, name: e.target.value })} />
          <Input value={opts.version} style={{ width: "35%" }} onChange={(e) => setOpts({ ...opts, version: e.target.value })} />
        </Space.Compact>
      </Form.Item>
      <Popconfirm title={t("TXT_CODE_4e4b52a0")} onConfirm={submit}>
        <Button type="primary">{t("TXT_CODE_3d09f0ac")}</Button>
      </Popconfirm>
    </>
  );
}

function BuildProgressDialog({ daemonId, isPhone, done }: { daemonId: string; isPhone: boolean; done: (r: void) => void }) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<{ name: string; status: number }[]>([]);
  const statusType: Record<string, string> = {
    "-1": t("TXT_CODE_20ce2aae"),
    "1": t("TXT_CODE_978da1c1"),
    "2": t("TXT_CODE_47e182a5")
  };
  const refresh = async () => {
    setLoading(true);
    setList([]);
    try {
      const state = await buildProgress({ params: { daemonId }, forceRequest: true });
      setList(Object.entries(state ?? {}).map(([name, status]) => ({ name, status })));
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    // Load once when the dialog opens, as upstream openDialog() did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Modal
      open={open}
      centered
      width={isPhone ? "100%" : "calc(100% - 30vw)"}
      title={t("TXT_CODE_4bbd3fde")}
      onCancel={() => {
        setOpen(false);
        done();
      }}
      footer={
        <Space>
          <Button loading={loading} onClick={() => void refresh()}>
            {t("TXT_CODE_b76d94e0")}
          </Button>
        </Space>
      }
    >
      {loading ? (
        <Row gutter={[24, 24]}>
          <Col span={24}>
            <Loading />
          </Col>
        </Row>
      ) : (
        <Row gutter={[24, 24]}>
          {list.map((i) => (
            <Col key={i.name + i.status} span={24} lg={6} md={8} sm={12}>
              <CardPanel title={i.name}>
                <Typography.Text>{statusType[String(i.status)]}</Typography.Text>
              </CardPanel>
            </Col>
          ))}
        </Row>
      )}
    </Modal>
  );
}

export default function NewImage({ card }: WidgetProps) {
  const { isPhone } = useScreen();
  const { toPage } = useAppRouters();
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const daemonId = getMetaOrRouteValue("daemonId") ?? "";
  const [drawer, setDrawer] = useState<Template | null>(null);

  const imageTypes = [
    { title: t("TXT_CODE_b09eff8f"), description: t("TXT_CODE_d7c5823e"), type: 1 },
    { title: t("TXT_CODE_9b9b745c"), description: t("TXT_CODE_7d1a9487"), type: 2 },
    { title: t("TXT_CODE_495027e1"), description: t("TXT_CODE_41d79430"), type: 3 },
    { title: t("TXT_CODE_123bcd09"), description: t("TXT_CODE_3d14442a"), type: 4 }
  ];

  const select = (type: number) => {
    const tpl = templateFor(type);
    if (!tpl) return reportErrorMsg(t("TXT_CODE_fb1ff943"));
    setDrawer(tpl);
  };

  return (
    <>
      <div style={{ height: "100%" }} className="container NewImage">
        <Row gutter={[24, 24]} style={{ height: "100%" }}>
          <Col span={24}>
            <BetweenMenus
              left={
                !isPhone && (
                  <Typography.Title className="mb-0" level={4}>
                    {card.title}
                  </Typography.Title>
                )
              }
              right={
                <>
                  <Button onClick={() => toPage({ path: "/node/image", query: { daemonId } })}>{t("TXT_CODE_3a818e91")}</Button>
                  <Button
                    type="primary"
                    onClick={() => void openDialog<void>((done) => <BuildProgressDialog daemonId={daemonId} isPhone={isPhone} done={done} />)}
                  >
                    {t("TXT_CODE_5544ec22")}
                  </Button>
                </>
              }
            />
          </Col>
          <Col span={24}>
            <CardPanel style={{ height: "100%" }}>
              <Typography>
                <Typography.Paragraph>
                  <Typography.Title level={5}>{t("TXT_CODE_d76ccb4f")}</Typography.Title>
                  <Typography.Text>{t("TXT_CODE_528753e7")}</Typography.Text>
                </Typography.Paragraph>
                <Typography.Paragraph>
                  <Typography.Title level={5}>{t("TXT_CODE_2ea7af21")}</Typography.Title>
                  <Typography.Text>{t("TXT_CODE_ba1eb3b5")}</Typography.Text>
                </Typography.Paragraph>
              </Typography>
            </CardPanel>
          </Col>
          {imageTypes.map((i) => (
            <Col key={i.type} span={24} lg={6} md={8} sm={12}>
              <CardPanel className="images-card" title={i.title} onClick={() => select(i.type)}>
                <Typography.Text>{i.description}</Typography.Text>
              </CardPanel>
            </Col>
          ))}
        </Row>
      </div>
      <Drawer open={!!drawer} size={isPhone ? undefined : 768} title="DockerFile" placement="right" destroyOnHidden onClose={() => setDrawer(null)}>
        {drawer && <DockerFileForm initial={drawer} daemonId={daemonId} onClose={() => setDrawer(null)} />}
      </Drawer>
    </>
  );
}
