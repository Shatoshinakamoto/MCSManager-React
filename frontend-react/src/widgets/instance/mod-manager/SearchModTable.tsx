/** Search results table (port of mod-manager/SearchModTable.vue). */
import { SearchOutlined } from "@ant-design/icons";
import { Avatar, Button, Flex, Pagination, Space, Spin, Table, Tag, type PaginationProps, type TableColumnsType } from "antd";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { safeImageUrl, type LocalMod, type SearchHit } from "./types";

interface Props {
  loading: boolean;
  dataSource: SearchHit[];
  columns: TableColumnsType<SearchHit>;
  pagination: PaginationProps;
  mods: LocalMod[];
  onChange: (p: { current: number; pageSize: number }) => void;
  onShowVersions: (m: SearchHit) => void;
  onOpenExternal: (m: SearchHit) => void;
}

const formatDate = (date?: string) => {
  if (!date) return "Unknown time!";
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function SearchModTable({ loading, dataSource, columns, pagination, mods, onChange, onShowVersions, onOpenExternal }: Props) {
  const { isPhone } = useScreen();
  const isInstalled = (record: SearchHit) => mods?.some((m) => m.extraInfo?.project?.id === record.id);

  if (loading && dataSource.length === 0)
    return (
      <div className="search-results-container w-full">
        <Flex vertical align="center" justify="center" className="py-32 text-center" style={{ minHeight: 400 }}>
          <Spin size="large" style={{ fontSize: 42 }} />
        </Flex>
      </div>
    );
  if (dataSource.length === 0)
    return (
      <div className="search-results-container w-full">
        <Flex vertical align="center" justify="center" className="py-32 text-center text-gray-400" style={{ minHeight: 400 }}>
          <div className="mb-4">
            <SearchOutlined style={{ fontSize: 42, opacity: 0.1 }} />
          </div>
          <div className="text-lg" style={{ opacity: 0.4 }}>
            {t("TXT_CODE_SEARCH_TIP")}
          </div>
        </Flex>
      </div>
    );

  const cell = (key: string, record: SearchHit) => {
    if (key === "icon") return <Avatar src={safeImageUrl(record.icon_url)} shape="square" size={40} className="rounded-md" />;
    if (key === "name")
      return (
        <div className="flex flex-col text-left overflow-hidden" style={{ minWidth: 0 }}>
          <div className="font-bold text-[15px] truncate w-full whitespace-nowrap" title={record.title}>
            {record.title}
          </div>
          {isPhone && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] opacity-60 font-mono bg-gray-500/10 px-1 rounded">{record.version_number || t("TXT_CODE_UNKNOWN_VERSION")}</span>
              <span className="text-[10px] opacity-60">{record.source}</span>
            </div>
          )}
          <div className="text-xs opacity-60 truncate w-full whitespace-nowrap mt-0.5" title={record.description}>
            {record.description}
          </div>
        </div>
      );
    if (key === "version")
      return (
        <div className="flex flex-col items-start justify-center overflow-hidden" style={{ minWidth: 0 }}>
          <div className="font-bold text-xs text-blue-600 dark:text-blue-400 truncate w-full font-mono whitespace-nowrap" title={record.version_number}>
            {record.version_number || t("TXT_CODE_UNKNOWN_VERSION")}
          </div>
          <div className="text-[9px] opacity-40 truncate w-full text-left whitespace-nowrap">{formatDate(record.updated)}</div>
        </div>
      );
    if (key === "type")
      return (
        <Tag color="blue" className="border-none rounded-md">
          {record.project_type}
        </Tag>
      );
    if (key === "source")
      return (
        <Tag color={record.source === "CurseForge" ? "orange" : record.source === "SpigotMC" ? "yellow" : "green"} className="border-none rounded-md">
          {record.source}
        </Tag>
      );
    if (key === "action") {
      const installed = isInstalled(record);
      return (
        <div className="flex justify-center">
          <Space size={12}>
            <Button type="link" size="small" className={`opacity-60 hover:opacity-100${installed ? " text-green-500" : ""}`} disabled={installed} onClick={() => onShowVersions(record)}>
              {installed ? t("TXT_CODE_INSTALLED") : t("TXT_CODE_65b21404")}
            </Button>
            <Button type="link" size="small" className="opacity-60 hover:opacity-100" onClick={() => onOpenExternal(record)}>
              {t("TXT_CODE_47fea88e")}
            </Button>
          </Space>
        </div>
      );
    }
    return null;
  };

  const cols = columns.map((c) => ({
    ...c,
    title: c.title ? <span className="font-bold">{c.title as string}</span> : c.title,
    render: (_: unknown, record: SearchHit) => cell(String(c.key), record)
  }));

  return (
    <div className="search-results-container w-full">
      <div className="search-results-table">
        <Table<SearchHit> loading={loading} dataSource={dataSource} columns={cols} pagination={false} rowKey="id" size="middle" />
        <div className="flex justify-end mt-12">
          <Pagination {...pagination} onChange={(current, pageSize) => onChange({ current, pageSize })} />
        </div>
      </div>
    </div>
  );
}
