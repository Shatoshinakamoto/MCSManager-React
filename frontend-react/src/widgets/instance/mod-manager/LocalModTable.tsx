/** Installed mods/plugins table (port of mod-manager/LocalModTable.vue). */
import { DeleteOutlined, DownOutlined, InfoCircleOutlined, PauseCircleOutlined, PlayCircleOutlined, SettingOutlined } from "@ant-design/icons";
import { Avatar, Button, Dropdown, Popconfirm, Space, Table, Tag, type TableColumnsType, type TablePaginationConfig } from "antd";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { safeImageUrl, type LocalMod } from "./types";

interface Props {
  loading: boolean;
  dataSource: LocalMod[];
  columns: TableColumnsType<LocalMod>;
  pagination: TablePaginationConfig;
  onChange: (p: TablePaginationConfig) => void;
  onToggle: (m: LocalMod) => void;
  onDelete: (m: LocalMod) => void;
  onConfig: (m: LocalMod) => void;
  onOpenExternal: (m: { id?: string; source?: string; slug?: string; name: string }) => void;
}

export default function LocalModTable({ loading, dataSource, columns, pagination, onChange, onToggle, onDelete, onConfig, onOpenExternal }: Props) {
  const { isPhone } = useScreen();

  const cell = (key: string, record: LocalMod) => {
    if (key === "icon") {
      const icon = safeImageUrl(record.extraInfo?.project?.icon_url);
      return icon ? <Avatar src={icon} shape="square" size={32} /> : <Avatar shape="square" size={32} style={{ fontSize: 14 }}>{(record.name || record.file).charAt(0).toUpperCase()}</Avatar>;
    }
    if (key === "name")
      return (
        <div className="flex flex-col overflow-hidden text-left" style={{ minWidth: 0 }}>
          <div className="font-bold text-[15px] truncate w-full whitespace-nowrap" title={record.name}>
            {record.name || record.file}
          </div>
          {isPhone && (
            <div className="flex items-center gap-2 mt-0.5 whitespace-nowrap">
              <span className="text-[11px] opacity-60 font-mono bg-gray-500/10 px-1 rounded">{record.version || t("TXT_CODE_UNKNOWN_VERSION")}</span>
              <span className={`text-[10px] font-bold ${record.enabled ? "text-green-500" : "text-red-500"}`}>{record.enabled ? t("TXT_CODE_ENABLED") : t("TXT_CODE_DISABLED")}</span>
            </div>
          )}
          {record.extraInfo?.project?.description ? (
            <div className="text-xs opacity-60 truncate w-full mt-0.5 whitespace-nowrap" title={record.extraInfo.project.description}>
              {record.extraInfo.project.description}
            </div>
          ) : (
            record.name && record.file !== record.name && <div className="text-[11px] opacity-40 truncate w-full mt-0.5 whitespace-nowrap">{record.file}</div>
          )}
        </div>
      );
    if (key === "version")
      return (
        <div className="truncate w-full font-mono text-xs opacity-80" title={record.version} style={{ minWidth: 0 }}>
          {record.version || t("TXT_CODE_UNKNOWN_VERSION")}
        </div>
      );
    // antd 6 tags have no end margin; the classic panel's 8px keeps the centring identical.
    if (key === "enabled") return <Tag style={{ marginInlineEnd: 8 }} color={record.enabled ? "green" : "red"}>{record.enabled ? t("TXT_CODE_ENABLED") : t("TXT_CODE_DISABLED")}</Tag>;
    if (key === "type") return <Tag color="blue">{record.type}</Tag>;
    if (key === "action")
      return (
        <div className="flex justify-center">
          {isPhone ? (
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "toggle", icon: record.enabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />, label: record.enabled ? t("TXT_CODE_DISABLE") : t("TXT_CODE_ENABLE"), onClick: () => onToggle(record) },
                  {
                    key: "info",
                    icon: <InfoCircleOutlined />,
                    label: t("TXT_CODE_f1b166e7"),
                    onClick: () =>
                      onOpenExternal({ id: record.extraInfo?.project?.id, source: record.extraInfo?.source, slug: record.extraInfo?.project?.slug, name: record.name || record.file })
                  },
                  { key: "delete", danger: true, icon: <DeleteOutlined />, label: t("TXT_CODE_6f2c1806"), onClick: () => onDelete(record) }
                ]
              }}
            >
              <Button size="small">
                {t("TXT_CODE_OPERATE")}
                <DownOutlined />
              </Button>
            </Dropdown>
          ) : (
            <Space size={12}>
              <Button type="text" size="small" className="opacity-60 hover:opacity-100" title={t("TXT_CODE_CONFIG")} icon={<SettingOutlined style={{ fontSize: 16 }} />} onClick={() => onConfig(record)} />
              <Button
                type="text"
                size="small"
                className="opacity-60 hover:opacity-100"
                title={record.enabled ? t("TXT_CODE_DISABLE") : t("TXT_CODE_ENABLE")}
                icon={record.enabled ? <PauseCircleOutlined style={{ fontSize: 16 }} /> : <PlayCircleOutlined style={{ fontSize: 16 }} />}
                onClick={() => onToggle(record)}
              />
              <Popconfirm title={t("TXT_CODE_71155575")} okText={t("TXT_CODE_d507abff")} cancelText={t("TXT_CODE_a0451c97")} onConfirm={() => onDelete(record)}>
                <Button type="link" size="small" danger title={t("TXT_CODE_6f2c1806")} icon={<DeleteOutlined style={{ fontSize: 16 }} />} />
              </Popconfirm>
            </Space>
          )}
        </div>
      );
    return null;
  };

  const cols = columns.map((c) => ({
    ...c,
    title: c.title ? <span className="font-bold">{c.title as string}</span> : c.title,
    render: (_: unknown, record: LocalMod) => cell(String(c.key), record)
  }));

  return <Table<LocalMod> loading={loading} dataSource={dataSource} columns={cols} rowKey="file" className="mb-6" size={isPhone ? "small" : "middle"} pagination={pagination} onChange={(p) => onChange(p)} />;
}
