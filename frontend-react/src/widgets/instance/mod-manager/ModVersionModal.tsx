/** Version picker for a search result (port of mod-manager/ModVersionModal.vue). */
import { CheckCircleOutlined, CloudDownloadOutlined, LoadingOutlined, WarningOutlined } from "@ant-design/icons";
import { Button, Modal, Table, Tag, Typography, type TableColumnsType } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import type { LocalMod, ModVersion, SearchFilters, SearchHit } from "./types";

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedMod: SearchHit | null;
  versions: ModVersion[];
  versionsLoading: boolean;
  searchFilters: SearchFilters;
  mods: LocalMod[];
  onDownload: (v: ModVersion) => void;
}

const DOWNLOAD_SPINNER_TIMEOUT_MS = 60000;

export default function ModVersionModal({ visible, onClose, versions, versionsLoading, searchFilters, mods, onDownload }: Props) {
  const { isPhone } = useScreen();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clearDownloading = () => {
    clearTimeout(timer.current);
    setDownloadingId(null);
  };

  const isInstalled = (record: ModVersion) =>
    mods?.some((m) => {
      if (m.extraInfo?.version?.id && m.extraInfo.version.id === record.id) return true;
      const target = record.filename || record.fileName || record.files?.[0]?.filename;
      return !!target && m.file === target;
    });

  // Stop the spinner once the version shows up as installed, or when the dialog closes.
  useEffect(() => {
    if (downloadingId && mods?.some((m) => m.extraInfo?.version?.id === downloadingId)) clearDownloading();
  }, [mods, downloadingId]);
  useEffect(() => {
    if (!visible) clearDownloading();
  }, [visible]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const handleDownload = (record: ModVersion) => {
    if (isInstalled(record) || downloadingId === record.id) return;
    setDownloadingId(record.id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDownloadingId((id) => (id === record.id ? null : id)), DOWNLOAD_SPINNER_TIMEOUT_MS);
    onDownload(record);
  };

  const sortedVersions = useMemo(() => {
    const vFilter = searchFilters?.version;
    const lFilter = searchFilters?.loader;
    if (!vFilter && !lFilter) return versions;
    const score = (v: ModVersion) =>
      (vFilter && v.game_versions?.includes(vFilter) ? 2 : 0) + (lFilter && v.loaders?.some((l) => l.toLowerCase() === lFilter.toLowerCase()) ? 1 : 0);
    return [...versions].sort((a, b) => {
      const d = score(b) - score(a);
      if (d) return d;
      const aDate = new Date(a.date_published || a.published_at || a.updated || 0).getTime();
      const bDate = new Date(b.date_published || b.published_at || b.updated || 0).getTime();
      if (aDate !== bDate && !isNaN(aDate) && !isNaN(bDate)) return bDate - aDate;
      return (b.version_number || "").localeCompare(a.version_number || "", undefined, { numeric: true, sensitivity: "base" });
    });
  }, [versions, searchFilters]);

  const base: TableColumnsType<ModVersion> = [
    { title: t("TXT_CODE_VERSION_NAME"), dataIndex: "name", key: "name", width: 130 },
    { title: t("TXT_CODE_VERSION_NUMBER"), dataIndex: "version_number", key: "version_number", width: 80 },
    {
      title: t("TXT_CODE_GAME_VERSION"),
      dataIndex: "game_versions",
      key: "game_versions",
      width: 100,
      render: (_: unknown, r) =>
        r.game_versions?.slice(0, 3).map((v) => (
          <Tag key={v} color={v === searchFilters?.version ? "blue" : undefined}>
            {v}
          </Tag>
        ))
    },
    {
      title: t("TXT_CODE_LOADER"),
      dataIndex: "loaders",
      key: "loaders",
      width: 500,
      render: (_: unknown, r) =>
        r.loaders?.map((l) => (
          <Tag key={l} color={l.toLowerCase() === searchFilters?.loader?.toLowerCase() ? "green" : "orange"}>
            {l}
          </Tag>
        ))
    },
    {
      title: t("TXT_CODE_OPERATE"),
      key: "action",
      width: 90,
      render: (_: unknown, r) => {
        const installed = isInstalled(r);
        const busy = downloadingId === r.id;
        return (
          <Button
            type="text"
            size="small"
            className={`opacity-60 hover:opacity-100${installed ? " text-green-500" : ""}`}
            disabled={installed || busy}
            title={installed ? t("TXT_CODE_INSTALLED") : t("TXT_CODE_DOWNLOAD")}
            icon={busy ? <LoadingOutlined style={{ fontSize: 16 }} /> : installed ? <CheckCircleOutlined style={{ fontSize: 16 }} /> : <CloudDownloadOutlined style={{ fontSize: 16 }} />}
            onClick={() => handleDownload(r)}
          />
        );
      }
    }
  ];
  const columns = isPhone ? base.filter((c) => ["name", "action"].includes(String(c.key))) : base;

  return (
    <Modal open={visible} title={t("TXT_CODE_VERSION_SELECT")} footer={null} width={isPhone ? "100%" : 900} onCancel={onClose}>
      <Typography className="mb-8">
        <Typography.Text>
          <WarningOutlined /> {t("TXT_CODE_6111bc9e")}
        </Typography.Text>
      </Typography>
      <Table<ModVersion> loading={versionsLoading} dataSource={sortedVersions} columns={columns} rowKey="id" size={isPhone ? "small" : "middle"} />
    </Modal>
  );
}
