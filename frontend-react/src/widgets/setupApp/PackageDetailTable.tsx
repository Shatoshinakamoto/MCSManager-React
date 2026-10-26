/**
 * Market template table (port of widgets/setupApp/PackageDetailTable.vue and
 * usePackageTableColumns.ts).
 *
 * SECURITY: every field comes from the market JSON (an admin-configured URL),
 * so it renders as React text only; images load only from http(s) URLs
 * (safeHttpUrl, CWE-79) with no referrer.
 */
import { DownloadOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { Avatar, Button, Flex, Modal, Popover, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { t } from "@/lang/i18n";
import { safeHttpUrl } from "@/tools/safeUrl";
import type { QuickStartPackages } from "@/types";
import "./PackageDetailTable.scss";

export type InstallType = "normal" | "docker";

const myLanguage = window.navigator.language.split("-")[0];

/** Localised field such as `title-zh`, falling back to the plain field. */
const localized = (r: QuickStartPackages, field: string): string => {
  const v = (r as unknown as Record<string, unknown>)[`${field}-${myLanguage}`];
  return typeof v === "string" && v ? v : String((r as unknown as Record<string, unknown>)[field] ?? "");
};

const cellText = (r: QuickStartPackages, field: keyof QuickStartPackages): string => {
  const v = r[field];
  if (v == null) return "";
  return Array.isArray(v) ? v.join(", ") : String(v);
};

export default function PackageDetailTable({
  dataSource,
  btnText = "",
  onSelect
}: {
  dataSource: QuickStartPackages[];
  btnText?: string;
  onSelect: (item: QuickStartPackages, type: InstallType) => void;
}) {
  const [configRecord, setConfigRecord] = useState<QuickStartPackages | null>(null);

  const columns = useMemo<ColumnsType<QuickStartPackages>>(
    () => [
      {
        key: "image",
        dataIndex: "image",
        title: "",
        width: 72,
        align: "center",
        fixed: "left",
        render: (_, r) => {
          const src = safeHttpUrl(r.image);
          return (
            <div className="package-table-image-cell">
              {src ? (
                <Popover
                  placement="top"
                  content={
                    <div className="package-table-image-popover">
                      <img src={src} alt="" referrerPolicy="no-referrer" className="package-table-image-popover-img" />
                    </div>
                  }
                >
                  <Avatar
                    src={
                      <img
                        src={src}
                        alt=""
                        referrerPolicy="no-referrer"
                        // Like the classic UI, a broken image leaves the plain grey tile.
                        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                      />
                    }
                    size={48}
                    shape="square"
                    className="package-table-avatar"
                  />
                </Popover>
              ) : (
                <span className="package-table-thumb-placeholder">—</span>
              )}
            </div>
          );
        }
      },
      {
        key: "title",
        dataIndex: "title",
        title: t("TXT_CODE_b5a0661a"),
        width: 160,
        align: "left",
        ellipsis: true,
        render: (_, r) => (
          <div>
            <Flex>
              <Typography.Text style={{ fontSize: 13, fontWeight: 600 }}>{localized(r, "title")}</Typography.Text>
              {r.setupInfo?.docker?.image && (
                <Tag color="cyan" className="ml-8">
                  {r.setupInfo.docker.image}
                </Tag>
              )}
            </Flex>
            <Tooltip title={r.description} placement="topLeft">
              <Typography.Text type="secondary" className="package-table-description-cell">
                {localized(r, "description")}
              </Typography.Text>
            </Tooltip>
          </div>
        )
      },
      {
        key: "platform",
        dataIndex: "platform",
        title: t("TXT_CODE_387e9722"),
        width: 90,
        align: "center",
        render: (_, r) => (cellText(r, "platform") ? <div className="ml-8"><Tag color="blue">{cellText(r, "platform")}</Tag></div> : <div />)
      },
      {
        key: "runtime",
        dataIndex: "runtime",
        title: t("TXT_CODE_c71dc792"),
        width: 90,
        align: "center",
        ellipsis: true,
        render: (_, r) => (cellText(r, "runtime") ? <div className="ml-8"><Tag color="blue">{cellText(r, "runtime")}</Tag></div> : <div />)
      },
      {
        key: "remark",
        dataIndex: "remark",
        title: t("TXT_CODE_b8e8e6f5"),
        width: 100,
        align: "center",
        ellipsis: true,
        render: (_, r) => (
          <Tooltip title={r.remark || "—"} placement="topLeft">
            <Typography.Text type="secondary" className="package-table-description-cell">
              {localized(r, "remark")}
            </Typography.Text>
          </Tooltip>
        )
      },
      {
        key: "author",
        dataIndex: "author",
        title: t("TXT_CODE_7c441b9"),
        width: 90,
        align: "center",
        ellipsis: true,
        render: (_, r) => (
          <div className="ml-8">
            <Tag color="green">{cellText(r, "author")}</Tag>
          </div>
        )
      },
      {
        key: "action",
        dataIndex: "action",
        title: t("TXT_CODE_fe731dfc"),
        width: 100,
        align: "center",
        render: (_, r) => (
          <Flex gap="small" align="center" justify="center">
            <Button type="primary" size="small" icon={<DownloadOutlined />} onClick={() => onSelect(r, "normal")}>
              {r.setupInfo?.docker?.image ? t("TXT_CODE_9123858b") : btnText || t("TXT_CODE_1704ea49")}
            </Button>
            <Button type="link" size="small" onClick={() => setConfigRecord(r)}>
              {t("TXT_CODE_ee5cd485")}
            </Button>
            {r.dockerOptional && (
              <Flex gap="1px" align="center" className="package-docker-optional-action">
                <Button type="link" size="small" onClick={() => onSelect(r, "docker")}>
                  {t("TXT_CODE_9123858b")}
                </Button>
                <Tooltip title={t("TXT_CODE_package_docker_optional_tooltip")} placement="top">
                  <QuestionCircleOutlined className="package-docker-optional-help-icon" tabIndex={0} />
                </Tooltip>
              </Flex>
            )}
          </Flex>
        )
      }
    ],
    [btnText, onSelect]
  );

  const configJson = useMemo(() => {
    if (!configRecord) return "";
    try {
      return JSON.stringify(configRecord, null, 2);
    } catch {
      return String(configRecord);
    }
  }, [configRecord]);

  return (
    <>
      <Table<QuickStartPackages>
        dataSource={dataSource}
        columns={columns}
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => t("TXT_CODE_TOTAL_ITEMS", { total }) }}
        rowKey={(r) => r.key ?? `${r.targetLink ?? ""}-${r.title ?? ""}-${r.language}`}
        size="middle"
      />
      <Modal open={!!configRecord} title={t("TXT_CODE_ee5cd485")} width={900} footer={null} destroyOnHidden onCancel={() => setConfigRecord(null)}>
        <div className="config-modal-body">
          <pre className="config-modal-json">
            <code>{configJson}</code>
          </pre>
        </div>
      </Modal>
    </>
  );
}
