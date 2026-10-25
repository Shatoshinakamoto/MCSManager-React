/** Port of NodeList.vue: the Daemons page (search, status filter, paging, add node). */
import { ClusterOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Col, Input, Pagination, Row, Select, Space, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import BetweenMenus from "@/components/BetweenMenus";
import FadeUp from "@/components/FadeUp";
import type { WidgetProps } from "@/config/widgets";
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import NodeDetailDialog, { type NodeDetailDialogHandle } from "./NodeDetailDialog";
import NodeItem from "./NodeItem";
import "./NodeList.scss";

// antd Select values must be strings/numbers; map to upstream's all/true/false.
type Status = "all" | "online" | "offline";

export default function NodeList({ card }: WidgetProps) {
  const { isPhone } = useScreen();
  const dialog = useRef<NodeDetailDialogHandle>(null);
  const { state, refresh } = useOverviewInfo();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>("all");
  const [name, setName] = useState("");
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const filtered = useMemo(
    () =>
      (state?.remote ?? []).filter(
        (n) => (status === "all" || n.available === (status === "online")) && (name === "" || n.remarks.toLowerCase().includes(name.toLowerCase()))
      ),
    [state, status, name]
  );
  const page = filtered.slice((current - 1) * pageSize, current * pageSize);

  // Step back a page when the last item on it disappears (upstream behaviour).
  useEffect(() => {
    if (page.length === 0 && current > 1) setCurrent((c) => c - 1);
  }, [page.length, current]);

  const doRefresh = async () => {
    try {
      setLoading(true);
      await refresh(true);
    } catch (error) {
      reportErrorMsg(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ height: "100%" }} className="NodeList container">
        <Row gutter={[24, 24]} style={{ height: "100%" }}>
          <Col span={24}>
            <BetweenMenus
              left={
                !isPhone && (
                  <Typography.Title className="mb-0" level={4}>
                    <ClusterOutlined /> {card.title}
                  </Typography.Title>
                )
              }
              right={
                <>
                  <Button disabled={loading} loading={loading} onClick={doRefresh}>
                    {t("TXT_CODE_b76d94e0")}
                  </Button>
                  <Button type="primary" onClick={() => dialog.current?.open()}>
                    {t("TXT_CODE_15a381d5")}
                  </Button>
                  <Button href="https://docs.mcsmanager.com/" target="_blank" rel="noopener noreferrer">
                    {t("TXT_CODE_3a302f23")}
                  </Button>
                </>
              }
              center={
                <div className="search-input">
                  <Space.Compact style={{ width: "100%" }}>
                    <Select<Status>
                      value={status}
                      style={{ width: 80 }}
                      onChange={setStatus}
                      options={[
                        { value: "all", label: t("TXT_CODE_c48f6f64") },
                        { value: "online", label: t("TXT_CODE_823bfe63") },
                        { value: "offline", label: t("TXT_CODE_66ce073e") }
                      ]}
                    />
                    <Input
                      value={name}
                      placeholder={t("TXT_CODE_461d1a01")}
                      style={{ width: "calc(100% - 80px)" }}
                      suffix={<SearchOutlined />}
                      onChange={(e) => {
                        setName(e.target.value.trim());
                        setCurrent(1);
                      }}
                    />
                  </Space.Compact>
                </div>
              }
            />
          </Col>
          <Col span={24}>
            <div className="desc">
              <Typography.Text type="secondary">
                {t("TXT_CODE_f9a92e38")}
                <br />
                {t("TXT_CODE_a65c65c2")}
              </Typography.Text>
              <div className="pagination">
                {/* ant-design-vue Pagination has no large size, so the Vue page renders the default one. */}
                <Pagination
                  size="middle"
                  current={current}
                  total={filtered.length}
                  pageSize={pageSize}
                  showSizeChanger
                  onChange={(c, size) => {
                    setCurrent(c);
                    setPageSize(size);
                  }}
                />
              </div>
            </div>
          </Col>
          {!loading && (
            <FadeUp>
              {page.map((item) => (
                <Col key={item.uuid + item.available + item.ip} span={24} lg={12}>
                  <NodeItem item={item} />
                </Col>
              ))}
            </FadeUp>
          )}
        </Row>
      </div>
      <NodeDetailDialog ref={dialog} />
    </>
  );
}
