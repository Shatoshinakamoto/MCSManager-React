/**
 * List of known config files present in the instance (port of
 * widgets/instance/ServerConfigOverview.vue). The candidate list comes from
 * the instance type; the daemon reports which of them exist.
 */
import { FileExclamationOutlined } from "@ant-design/icons";
import { Button, Col, Empty, List, Row, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import BetweenMenus from "@/components/BetweenMenus";
import CardPanel from "@/components/CardPanel";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { getInstanceConfigByType, type InstanceConfigs } from "@/hooks/instanceConfigs";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { getConfigFileList } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard } from "@/types";

export default function ServerConfigOverview({ card }: { card: LayoutCard }) {
  const { isPhone } = useScreen();
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const instanceId = getMetaOrRouteValue("instanceId") ?? "";
  const daemonId = getMetaOrRouteValue("daemonId") ?? "";
  const type = getMetaOrRouteValue("type", false) ?? "";
  const { toPage } = useAppRouters();
  const [list, setList] = useState<InstanceConfigs[]>([]);
  const [found, setFound] = useState(0);
  const [loading, setLoading] = useState(false);

  const render = useCallback(async () => {
    setLoading(true);
    try {
      const configFiles = getInstanceConfigByType(type);
      const realFiles = await getConfigFileList({
        forceRequest: true,
        params: { uuid: instanceId, daemonId },
        data: { files: configFiles.map((v) => v.path) }
      });
      if (!realFiles) return reportErrorMsg(t("TXT_CODE_83e553fc"));
      // Same marking as upstream: a path listed twice for this type is a conflict.
      realFiles.forEach((v) => {
        configFiles.forEach((z) => {
          if (z.path === v.file) {
            configFiles.forEach((p) => {
              if (p.path == z.path && p.check) z.conflict = true;
            });
            z.check = true;
          }
        });
      });
      setFound(realFiles.length);
      setList(configFiles);
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setLoading(false);
    }
  }, [type, instanceId, daemonId]);

  useEffect(() => {
    void render();
  }, [render]);

  const toEdit = (configName: string, configPath: string, extName: string) =>
    toPage({ path: "/instances/terminal/serverConfig/fileEdit", query: { type, configName, configPath, extName } });

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
                <Button onClick={() => toPage({ path: "/instances/terminal", query: { daemonId, instanceId } })}>{t("TXT_CODE_95b9833f")}</Button>
                <Button loading={loading} onClick={() => void render()}>
                  {t("TXT_CODE_b76d94e0")}
                </Button>
              </>
            }
          />
        </Col>
        <Col span={24}>
          <CardPanel style={{ height: "100%" }}>
            {found > 0 ? (
              <List
                itemLayout="horizontal"
                loading={loading}
                dataSource={list.filter((item) => item.check)}
                renderItem={(item) => (
                  <List.Item
                    // antd 6 pads list items 16px; the classic panel uses 12px.
                    style={{ padding: "12px 24px" }}
                    actions={[
                      <Button key="edit" size="middle" onClick={() => toEdit(item.redirect, item.path, item.type)}>
                        {t("TXT_CODE_ad207008")}
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <>
                          {item.conflict && <Tag color="warning">{t("TXT_CODE_1af148fe")}</Tag>}
                          <Typography.Title level={5}>{item.fileName}</Typography.Title>
                        </>
                      }
                      description={
                        <>
                          {item.info}
                          <br />
                          {item.conflict && <Typography.Text type="danger">{t("TXT_CODE_91b3fa98")}</Typography.Text>}
                        </>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty
                className="mt-40 mb-40"
                description={
                  <>
                    <p style={{ fontSize: 16, marginTop: 40 }}>
                      <FileExclamationOutlined className="mr-4" />
                      {t("TXT_CODE_37a4c14a")}
                    </p>
                    <p style={{ fontSize: 14, marginBottom: 10 }}>{t("TXT_CODE_4c0fda9")}</p>
                  </>
                }
              />
            )}
          </CardPanel>
        </Col>
      </Row>
    </div>
  );
}
