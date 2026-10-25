/**
 * Design-mode "add card" overlay and its params drawer (port of
 * NewCardList/index.vue + params.vue). Picking a card inserts a deep copy
 * into the current page's layout; cards with params ask for them first.
 *
 * Security: param values are stored in card.meta and later read by widgets
 * as ids (never as HTML or URLs); the panel validates ids on every API call.
 * Cards above the page's permission level are refused (same rule as upstream).
 */
import { AppstoreOutlined, BulbOutlined } from "@ant-design/icons";
import { Alert, Button, Col, Drawer, Form, Input, Radio, Row, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { useLocation } from "react-router";
import LayoutCard from "@/components/LayoutCard";
import { getLayoutCardPool, NEW_CARD_TYPE, type NewCardItem } from "@/config/cardPool";
import { findRoute } from "@/config/routes";
import { t } from "@/lang/i18n";
import { useLayoutConfig } from "@/stores/layoutConfig";
import { useLayoutContainer } from "@/stores/layoutContainer";
import { reportErrorMsg } from "@/tools/validator";
import { ROLE } from "@/types";
import "./NewCardList.scss";

const ID_VALUE = /^[A-Za-z0-9_-]{1,128}$/;

export default function NewCardList() {
  const { pathname } = useLocation();
  const { showNewCardDialog, setShowNewCardDialog } = useLayoutContainer();
  const insertItem = useLayoutConfig((s) => s.insertItem);
  const [category, setCategory] = useState(NEW_CARD_TYPE.COMMON);
  const [paramsCard, setParamsCard] = useState<NewCardItem | null>(null);
  const [form] = Form.useForm<Record<string, string>>();
  const pageRole = findRoute(pathname)?.meta.permission ?? ROLE.GUEST;

  const pool = useMemo(
    () => (showNewCardDialog ? getLayoutCardPool().filter((v) => (v.onlyPath ? v.onlyPath.includes(pathname) : true)).filter((v) => !v.disableAdd) : []),
    [showNewCardDialog, pathname]
  );

  const insert = (card: NewCardItem, meta?: Record<string, unknown>) => {
    const copy = structuredClone(card);
    if (meta) copy.meta = meta;
    insertItem(pathname, copy);
    setShowNewCardDialog(false);
  };

  const pick = (card: NewCardItem) => {
    if (card.permission > pageRole) return reportErrorMsg(t("TXT_CODE_fb4cb9cb"));
    if (card.params) {
      form.resetFields();
      setParamsCard(card);
      return;
    }
    insert(card);
  };

  const submitParams = async () => {
    const values = await form.validateFields();
    if (paramsCard) insert(paramsCard, values);
    setParamsCard(null);
  };

  const categories = [
    { label: t("TXT_CODE_6e23c48"), value: NEW_CARD_TYPE.COMMON },
    { label: t("TXT_CODE_41406a5f"), value: NEW_CARD_TYPE.DATA },
    { label: t("TXT_CODE_d941eb89"), value: NEW_CARD_TYPE.INSTANCE },
    { label: t("TXT_CODE_76b2a495"), value: NEW_CARD_TYPE.OTHER }
  ];

  return (
    <>
      {showNewCardDialog && (
        <div className="new-card-list-container">
          <div className="new-card-list">
            <div className="mb-24">
              <Radio.Group value={category} size="large" optionType="button" options={categories} onChange={(e) => setCategory(e.target.value)} />
              <Button className="ml-8" onClick={() => setShowNewCardDialog(false)}>{t("TXT_CODE_a7e9d4e")}</Button>
            </div>
            {pool.filter((c) => c.category === category).map((card) => (
              <Row key={card.id} style={{ marginBottom: 48 }}>
                <Col span={24}>
                  <Typography>
                    <Typography.Title level={4}><AppstoreOutlined /><span className="ml-4">{card.title}</span></Typography.Title>
                    <Typography.Paragraph>
                      {t("TXT_CODE_8575f7c")}
                      {card.permission >= ROLE.ADMIN ? <Tag color="red">{t("TXT_CODE_cd978243")}</Tag>
                        : card.permission >= ROLE.USER ? <Tag color="green">{t("TXT_CODE_b67197fc")}</Tag>
                        : <Tag color="green">{t("TXT_CODE_b488372f")}</Tag>}
                    </Typography.Paragraph>
                    <Typography.Paragraph>{t("TXT_CODE_d486a561")} {card.description}</Typography.Paragraph>
                  </Typography>
                </Col>
                <Col span={24} md={24} lg={card.width * 2}>
                  <div className="card-container-wrapper" style={{ position: "relative" }}>
                    {card.permission > pageRole && (
                      <div className="card-alert"><Alert showIcon title={t("TXT_CODE_cd8cd5d2")} type="warning" /></div>
                    )}
                    <div className="card-list-container" style={{ height: card.height }} onClick={() => pick(card)}>
                      {/* Preview only: params-driven cards render without ids here. */}
                      <LayoutCard card={card} />
                    </div>
                  </div>
                </Col>
              </Row>
            ))}
          </div>
        </div>
      )}

      <Drawer className="global-text-color" title={t("TXT_CODE_e4c84088")} placement="bottom" open={!!paramsCard} onClose={() => setParamsCard(null)}
        extra={<>
          <Button style={{ marginRight: 8 }} onClick={() => setParamsCard(null)}>{t("TXT_CODE_a0451c97")}</Button>
          <Button type="primary" onClick={submitParams}>{t("TXT_CODE_d507abff")}</Button>
        </>}>
        {paramsCard && (
          <div className="app-max-width">
            <Form form={form} layout="vertical" autoComplete="off">
              <Row gutter={[20, 20]}>
                {/* TODO(port, phase 2): "instance" params open the instance picker dialog. */}
                {paramsCard.params?.filter((p) => p.type === "string").map((p) => (
                  <Col key={p.field} span={24} md={12}>
                    {/* SECURITY: ids are allow-listed characters only (CWE-20). */}
                    <Form.Item label={p.label} name={p.field} rules={[{ pattern: ID_VALUE, message: p.label }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                ))}
              </Row>
            </Form>
            <p><BulbOutlined /><span className="ml-4">{t("TXT_CODE_e29b79df")}</span></p>
            <p>{t("TXT_CODE_13663120")}</p>
          </div>
        )}
      </Drawer>
    </>
  );
}
