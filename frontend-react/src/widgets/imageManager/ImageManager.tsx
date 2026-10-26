/**
 * Docker images page (port of widgets/imageManager/index.vue): images and
 * containers on one daemon, image details, image delete.
 *
 * Security: image and container metadata comes from the daemon's Docker host
 * and can hold arbitrary label text. Upstream rendered the detail JSON with
 * innerHTML; here it is a text node inside <pre> (CWE-79). The panel and
 * daemon enforce who may list or delete images.
 */
import { App, Button, Col, Popconfirm, Row, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import BetweenMenus from "@/components/BetweenMenus";
import CardPanel from "@/components/CardPanel";
import type { WidgetProps } from "@/config/widgets";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { containerList, imageList } from "@/services/apis/envImage";
import { reportErrorMsg } from "@/tools/validator";
import type { ContainerInfo, ImageInfo } from "@/types/docker";

function IdCell({ id, isPhone }: { id: string; isPhone: boolean }) {
  return (
    <Typography.Paragraph className="mb-0" copyable={{ text: id }} ellipsis={{ rows: 1, expandable: false }}>
      {isPhone ? "" : id}
    </Typography.Paragraph>
  );
}

export default function ImageManager({ card }: WidgetProps) {
  const { modal, notification } = App.useApp();
  const { isPhone } = useScreen();
  const { toPage } = useAppRouters();
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const daemonId = getMetaOrRouteValue("daemonId") ?? "";

  const [images, setImages] = useState<ImageInfo[]>();
  const [containers, setContainers] = useState<ContainerInfo[]>();
  const [imgLoading, setImgLoading] = useState(false);
  const [ctnLoading, setCtnLoading] = useState(false);

  const loadImages = useCallback(async (force = false) => {
    setImgLoading(true);
    try {
      setImages(await imageList({ params: { daemonId }, method: "GET", forceRequest: force }));
    } catch (err) {
      modal.error({ centered: true, closable: true, content: err instanceof Error ? err.message : String(err), title: t("TXT_CODE_ac405b50") });
    } finally {
      setImgLoading(false);
    }
  }, [daemonId, modal]);

  const loadContainers = useCallback(async (force = false) => {
    setCtnLoading(true);
    try {
      setContainers(await containerList({ params: { daemonId }, forceRequest: force }));
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setCtnLoading(false);
    }
  }, [daemonId]);

  useEffect(() => {
    void (async () => {
      await loadImages();
      await loadContainers();
    })();
  }, [loadImages, loadContainers]);

  const showDetail = (info: unknown) =>
    modal.info({
      centered: true,
      closable: true,
      width: 500,
      title: t("TXT_CODE_9d820cb4"),
      content: (
        <>
          <p>{t("TXT_CODE_bbd7d448")}</p>
          <pre style={{ maxHeight: 460, overflow: "auto" }}>{JSON.stringify(info, null, 4)}</pre>
        </>
      )
    });

  const delImage = async (item: ImageInfo) => {
    try {
      await imageList({ params: { daemonId, imageId: item?.RepoTags?.[0] || "" }, method: "DELETE" });
      notification.info({ title: t("TXT_CODE_638bca20"), description: t("TXT_CODE_d11bf156") });
    } catch (err) {
      reportErrorMsg(err);
    }
  };

  const imageColumns: ColumnsType<ImageInfo> = [
    { align: "center", title: "ID", dataIndex: "Id", key: "Id", render: (id: string) => <IdCell id={id} isPhone={isPhone} /> },
    { align: "center", title: t("TXT_CODE_bff43de3"), dataIndex: "RepoTags", key: "RepoTags", render: (v: string[]) => v?.[0] || "<none>" },
    { align: "center", title: t("TXT_CODE_6f91f3ba"), dataIndex: "Size", key: "Size", render: (v: number) => `${Math.trunc(v / 1024 / 1024)} MB` },
    {
      align: "center",
      title: t("TXT_CODE_fe731dfc"),
      key: "action",
      minWidth: 200,
      render: (_, record) => (
        <>
          <Button className="mr-8" size="large" onClick={() => showDetail(record)}>
            {t("TXT_CODE_f1b166e7")}
          </Button>
          <Popconfirm title={t("TXT_CODE_dfa17b2d")} onConfirm={() => delImage(record)}>
            <Button size="large" danger>
              {t("TXT_CODE_ecbd7449")}
            </Button>
          </Popconfirm>
        </>
      )
    }
  ];

  const containerColumns: ColumnsType<ContainerInfo> = [
    { align: "center", title: "ID", dataIndex: "Id", key: "Id", render: (id: string) => <IdCell id={id} isPhone={isPhone} /> },
    { align: "center", title: t("TXT_CODE_d12fa808"), dataIndex: "Command", key: "Command" },
    { align: "center", title: t("TXT_CODE_47c62dac"), dataIndex: "Image", key: "Image" },
    { align: "center", title: t("TXT_CODE_759fb403"), dataIndex: "State", key: "State" },
    { align: "center", title: t("TXT_CODE_24e5bff2"), dataIndex: "Status", key: "Status" },
    {
      align: "center",
      title: t("TXT_CODE_fe731dfc"),
      key: "action",
      minWidth: 200,
      render: (_, record) => (
        <Button className="mr-8" size="large" onClick={() => showDetail(record)}>
          {t("TXT_CODE_f1b166e7")}
        </Button>
      )
    }
  ];

  return (
    <div style={{ height: "100%" }} className="container">
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
                <Button onClick={() => void loadImages(true)}>{t("TXT_CODE_b76d94e0")}</Button>
                <Button type="primary" onClick={() => toPage({ path: "/node/image/new", query: { daemonId } })}>
                  <span>{t("TXT_CODE_59ac0239")}</span>
                </Button>
              </>
            }
          />
        </Col>
        <Col span={24}>
          <CardPanel style={{ height: "100%" }} title={t("TXT_CODE_8b62abb2")}>
            <Typography.Paragraph>
              <Typography.Text>{t("TXT_CODE_ba82dddb")}</Typography.Text>
            </Typography.Paragraph>
            <Table<ImageInfo>
              rowKey="Id"
              scroll={{ x: "max-content" }}
              dataSource={images}
              columns={imageColumns}
              pagination={{ size: "middle", pageSize: 10, showSizeChanger: true }}
              loading={imgLoading}
            />
          </CardPanel>
        </Col>
        <Col span={24}>
          <CardPanel style={{ height: "100%" }} title={t("TXT_CODE_cb36c80e")}>
            <Typography.Paragraph>
              <Typography.Text>{t("TXT_CODE_b34efc1")}</Typography.Text>
            </Typography.Paragraph>
            <Table<ContainerInfo>
              rowKey="Id"
              scroll={{ x: "max-content" }}
              dataSource={containers}
              columns={containerColumns}
              pagination={{ size: "middle", pageSize: 10, showSizeChanger: true }}
              loading={ctnLoading}
            />
          </CardPanel>
        </Col>
      </Row>
    </div>
  );
}
