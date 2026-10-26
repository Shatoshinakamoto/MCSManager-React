/**
 * Audit log page (port of widgets/AuditLog.vue): filter by type, level,
 * operator, time range and keyword; paged table; detail dialog with the
 * before/after config diff.
 *
 * Security: every value comes from the panel's operation log, which records
 * user-controlled names (instance, daemon, operator) and request IPs. All of
 * it renders as React text, never HTML (CWE-79). The panel restricts the
 * endpoint to admins.
 */
import { FileProtectOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Col, DatePicker, Descriptions, Form, Input, Modal, Row, Select, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BetweenMenus from "@/components/BetweenMenus";
import CardPanel from "@/components/CardPanel";
import type { WidgetProps } from "@/config/widgets";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { searchOperationLog } from "@/services/apis";
import { buildRenderMap, generateTextByItem, getColorByLevel, operationTypeNameMap } from "@/tools/operationLog";
import { reportErrorMsg } from "@/tools/validator";
import type { OperationLoggerItem, OperationLoggerType } from "@/types/operationLog";
import "./AuditLog.scss";

interface QueryForm {
  type?: string;
  level?: string;
  operatorName: string;
  keyword: string;
  timeRange?: [Dayjs, Dayjs] | null;
  currentPage: number;
  pageSize: number;
}

const defaultQueryForm = (): QueryForm => ({
  type: undefined,
  level: undefined,
  operatorName: "",
  keyword: "",
  timeRange: undefined,
  currentPage: 1,
  pageSize: 20
});

const BASE_DETAIL_KEYS = [
  "type",
  "operation_id",
  "operation_time",
  "operation_level",
  "operator_ip",
  "operator_name",
  "operator_source",
  "instance_name",
  "daemon_name",
  "config_before",
  "config_after"
];

type LooseItem = OperationLoggerItem & Record<string, unknown>;

const formatTime = (time?: string | number) => {
  const ts = Number(time);
  return ts ? dayjs(ts).format("YYYY-MM-DD HH:mm:ss") : "--";
};

export default function AuditLog({ card }: WidgetProps) {
  const { isPhone } = useScreen();
  const [form, setForm] = useState<QueryForm>(defaultQueryForm);
  const formRef = useRef(form);
  formRef.current = form;
  const [rows, setRows] = useState<OperationLoggerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<LooseItem | null>(null);

  const renderMap = useMemo(() => buildRenderMap(), []);
  const typeNames = useMemo(() => operationTypeNameMap(), []);
  const typeOptions = Object.entries(typeNames).map(([value, label]) => ({ value, label }));
  const levelOptions = [
    { value: "info", label: t("TXT_CODE_92c9a2f3") },
    { value: "warning", label: t("TXT_CODE_617ce69c") },
    { value: "error", label: t("TXT_CODE_ac405b50") }
  ];
  const levelName = (level: OperationLoggerItem["operation_level"]) => levelOptions.find((o) => o.value === level)?.label || level;
  const typeName = (type: OperationLoggerType) => typeNames[type] || type;

  const fetchData = useCallback(async () => {
    const f = formRef.current;
    setLoading(true);
    try {
      const res = await searchOperationLog({
        params: {
          page: f.currentPage,
          page_size: f.pageSize,
          type: f.type || undefined,
          level: f.level || undefined,
          operator_name: f.operatorName.trim() || undefined,
          keyword: f.keyword.trim() || undefined,
          start_time: f.timeRange?.[0] ? f.timeRange[0].valueOf() : undefined,
          end_time: f.timeRange?.[1] ? f.timeRange[1].valueOf() : undefined
        },
        forceRequest: true
      });
      setRows(res?.data ?? []);
      setTotal(res?.total ?? 0);
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Upstream throttles to one query per 600 ms.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const update = (patch: Partial<QueryForm>, run: "search" | "none" = "search") => {
    formRef.current = { ...formRef.current, ...patch, ...(run === "search" ? { currentPage: 1 } : {}) };
    setForm(formRef.current);
    if (run === "none") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void fetchData(), 600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const reset = () => {
    formRef.current = defaultQueryForm();
    setForm(formRef.current);
    void fetchData();
  };

  const contentMain = (r: OperationLoggerItem) => {
    const text = generateTextByItem(r, "managementText", renderMap);
    return text === "--" ? "" : text;
  };
  const scopeLabel = (r: LooseItem) => {
    const parts: string[] = [];
    if (r.instance_name) parts.push(`${t("TXT_CODE_cb043d10")}: ${String(r.instance_name)}`);
    if (r.daemon_name) parts.push(`${t("TXT_CODE_e076d90b")}: ${String(r.daemon_name)}`);
    return parts.join(" · ");
  };

  const columns: ColumnsType<OperationLoggerItem> = [
    {
      align: "center",
      title: t("TXT_CODE_7edf331d"),
      dataIndex: "operation_time",
      key: "operation_time",
      width: 165,
      render: (v) => <span className="audit-time">{formatTime(v)}</span>
    },
    ...(!isPhone
      ? [
          {
            align: "center" as const,
            title: t("TXT_CODE_2d3fc1f8"),
            dataIndex: "operation_level",
            key: "operation_level",
            width: 85,
            render: (v: OperationLoggerItem["operation_level"]) => <Tag color={getColorByLevel(v)}>{levelName(v)}</Tag>
          }
        ]
      : []),
    { align: "center", title: t("TXT_CODE_5b265628"), dataIndex: "type", key: "type", width: 140, render: (v) => <Tag>{typeName(v)}</Tag> },
    ...(!isPhone
      ? [
          {
            align: "center" as const,
            title: t("TXT_CODE_745f713e"),
            dataIndex: "operator_name",
            key: "operator_name",
            width: 130,
            render: (_: unknown, r: OperationLoggerItem) => (
              <span>
                {r.operator_name || "--"}
                {r.operator_source && (
                  <Tag color="purple" className="ml-4">
                    API
                  </Tag>
                )}
              </span>
            )
          }
        ]
      : []),
    {
      align: "left",
      title: t("TXT_CODE_28a7b54"),
      key: "content",
      minWidth: 260,
      render: (_, record) => {
        const r = record as LooseItem;
        const main = contentMain(r);
        const scope = scopeLabel(r);
        return (
          <div className="audit-content">
            {main && <div className="audit-content-main">{main}</div>}
            {scope && (
              <div className="audit-content-scope" title={String(r.instance_id || r.daemon_id || "")}>
                {scope}
              </div>
            )}
            {!main && !scope && <span>--</span>}
          </div>
        );
      }
    },
    {
      align: "center",
      title: t("TXT_CODE_fe731dfc"),
      key: "action",
      width: 90,
      render: (_, r) => (
        <Button size="middle" onClick={() => setDetail(r as LooseItem)}>
          {t("TXT_CODE_f1b166e7")}
        </Button>
      )
    }
  ];

  const extraFields = detail
    ? Object.entries(detail)
        .filter(([key, value]) => !BASE_DETAIL_KEYS.includes(key) && value !== undefined)
        .map(([key, value]) => ({ key, value: typeof value === "string" ? value : JSON.stringify(value) }))
    : [];
  const configBefore = detail?.config_before ? JSON.stringify(detail.config_before, null, 2) : "";
  const configAfter = detail?.config_after ? JSON.stringify(detail.config_after, null, 2) : "";

  return (
    <div style={{ height: "100%" }} className="container AuditLog">
      <Row gutter={[24, 24]} style={{ height: "100%" }}>
        <Col span={24}>
          <BetweenMenus
            left={
              !isPhone && (
                <Typography.Title className="mb-0" level={4}>
                  <FileProtectOutlined /> {card.title} ({total})
                </Typography.Title>
              )
            }
            right={
              <Button loading={loading} onClick={() => void fetchData()}>
                {t("TXT_CODE_b76d94e0")}
              </Button>
            }
          />
        </Col>
        <Col span={24}>
          <CardPanel style={{ height: "100%" }}>
            <div className="audit-filter mb-16">
              <Form layout="inline">
                <Form.Item label={t("TXT_CODE_5b265628")} className="mb-8">
                  <Select
                    value={form.type}
                    placeholder={t("TXT_CODE_68022ee7")}
                    allowClear
                    showSearch={{ optionFilterProp: "label" }}
                    style={{ width: 180 }}
                    options={typeOptions}
                    onChange={(type) => update({ type })}
                  />
                </Form.Item>
                <Form.Item label={t("TXT_CODE_2d3fc1f8")} className="mb-8">
                  <Select
                    value={form.level}
                    placeholder={t("TXT_CODE_68022ee7")}
                    allowClear
                    style={{ width: 120 }}
                    options={levelOptions}
                    onChange={(level) => update({ level })}
                  />
                </Form.Item>
                <Form.Item label={t("TXT_CODE_745f713e")} className="mb-8">
                  <Input
                    value={form.operatorName}
                    placeholder={t("TXT_CODE_4ea93630")}
                    allowClear
                    style={{ width: 140 }}
                    onChange={(e) => update({ operatorName: e.target.value })}
                  />
                </Form.Item>
                <Form.Item label={t("TXT_CODE_482e7583")} className="mb-8">
                  <DatePicker.RangePicker
                    value={form.timeRange ?? null}
                    size="large"
                    showTime
                    style={{ width: 340 }}
                    onChange={(v) => update({ timeRange: (v as [Dayjs, Dayjs] | null) ?? undefined })}
                  />
                </Form.Item>
                <Form.Item label={t("TXT_CODE_fe7c7d2d")} className="mb-8">
                  <Input
                    value={form.keyword}
                    placeholder={t("TXT_CODE_4ea93630")}
                    allowClear
                    style={{ width: 160 }}
                    suffix={<SearchOutlined />}
                    onChange={(e) => update({ keyword: e.target.value }, "none")}
                    onPressEnter={() => update({})}
                  />
                </Form.Item>
                <Form.Item className="mb-8">
                  <Button type="primary" loading={loading} onClick={() => update({})}>
                    {t("TXT_CODE_ee8ae330")}
                  </Button>
                  <Button className="ml-8" onClick={reset}>
                    {t("TXT_CODE_50d471b2")}
                  </Button>
                </Form.Item>
              </Form>
            </div>
            <Table<OperationLoggerItem>
              dataSource={rows}
              columns={columns}
              loading={loading}
              rowKey="operation_id"
              scroll={{ x: "max-content" }}
              pagination={{
                size: "middle",
                current: form.currentPage,
                pageSize: form.pageSize,
                total,
                hideOnSinglePage: false,
                showSizeChanger: true
              }}
              onChange={(p) => {
                formRef.current = { ...formRef.current, currentPage: p.current || 1, pageSize: p.pageSize || 20 };
                setForm(formRef.current);
                void fetchData();
              }}
            />
          </CardPanel>
        </Col>
      </Row>

      <Modal open={!!detail} centered width={820} title={t("TXT_CODE_d1f48be5")} footer={null} destroyOnHidden onCancel={() => setDetail(null)}>
        {detail && (
          <div className="audit-detail">
            <Typography.Paragraph className="audit-sentence">{generateTextByItem(detail, "text", renderMap)}</Typography.Paragraph>
            <Descriptions bordered size="small" column={isPhone ? 1 : 2} className="mb-16">
              <Descriptions.Item label={t("TXT_CODE_7edf331d")}>{formatTime(detail.operation_time)}</Descriptions.Item>
              <Descriptions.Item label={t("TXT_CODE_2d3fc1f8")}>
                <Tag color={getColorByLevel(detail.operation_level)}>{levelName(detail.operation_level)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t("TXT_CODE_5b265628")}>
                <Tag>{typeName(detail.type)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t("TXT_CODE_745f713e")}>
                {detail.operator_name || "--"}
                {detail.operator_source && (
                  <Tag color="purple" className="ml-4">
                    API
                  </Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label={t("TXT_CODE_5b845bf0")}>{detail.operator_ip || "--"}</Descriptions.Item>
              <Descriptions.Item label={t("TXT_CODE_cb043d10")}>{String(detail.instance_name || "--")}</Descriptions.Item>
              <Descriptions.Item label={t("TXT_CODE_e076d90b")}>{String(detail.daemon_name || "--")}</Descriptions.Item>
              {extraFields.map((f) => (
                <Descriptions.Item key={f.key} label={f.key}>
                  <span className="audit-extra-value">{f.value}</span>
                </Descriptions.Item>
              ))}
            </Descriptions>
            {(configBefore || configAfter) && (
              <Row gutter={[16, 16]}>
                <Col span={isPhone ? 24 : 12}>
                  <Typography.Title level={5}>{t("TXT_CODE_cb111efa")}</Typography.Title>
                  <pre className="audit-json">{configBefore || "--"}</pre>
                </Col>
                <Col span={isPhone ? 24 : 12}>
                  <Typography.Title level={5}>{t("TXT_CODE_c918e658")}</Typography.Title>
                  <pre className="audit-json">{configAfter || "--"}</pre>
                </Col>
              </Row>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
