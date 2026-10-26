/**
 * Instance file manager card (port of widgets/instance/FileManager.vue):
 * tabs, breadcrumb/path editing, paged listing with search, right-click and
 * row actions, uploads (files, folders, drag and drop), download-from-URL
 * tasks, and the upload progress bar. State and actions live in
 * hooks/useFileManager.ts.
 *
 * File names come from the daemon and are rendered as React text (escaped).
 */
import {
  CaretRightOutlined,
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  FileOutlined,
  FileZipOutlined,
  FolderOutlined,
  FormOutlined,
  KeyOutlined,
  PauseOutlined,
  PlusOutlined,
  ScissorOutlined,
  SearchOutlined,
  UploadOutlined
} from "@ant-design/icons";
import { App, Breadcrumb, Button, Col, Dropdown, Input, Progress, Row, Select, Space, Spin, Table, Tabs, Tooltip, Typography, type InputRef, type TableColumnsType } from "antd";
import dayjs from "dayjs";
import { createElement, useEffect, useRef, useState, type DragEvent } from "react";
import BetweenMenus from "@/components/BetweenMenus";
import CardPanel from "@/components/CardPanel";
import { openDownloadFileDialog } from "@/components/fc/DownloadFileDialog";
import { openRightClickMenu, toMenuProps, type MenuAction } from "@/components/RightMenu";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useFileManager } from "@/hooks/useFileManager";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import uploadService, { useUploadState } from "@/services/uploadService";
import { arrayFilter, type ConditionFilterItem } from "@/tools/array";
import { filterFileName, getFileExtName, getFileIcon, isCompressFile } from "@/tools/fileManager";
import { convertFileSize } from "@/tools/fileSize";
import type { LayoutCard } from "@/types";
import type { DataType } from "@/types/fileManager";
import { openFileEditor } from "./dialogs/FileEditor";
import "./FileManager.scss";

const STATUS_POLL_MS = 3000;
const PROGRESS_COLORS = { "0%": "#49b3ff", "100%": "#25f5b9" };

/** One upload piece: fills with progress, turns red with retries (UploadTaskProgress.vue). */
function UploadTaskProgress({ progress, retries }: { progress: number; retries: number }) {
  return (
    <div className="flex overflow-hidden" style={{ width: 16, height: 16, borderRadius: 6, border: "1px solid #ccc", overflow: "hidden", backgroundColor: `rgba(255, 0, 0, ${retries / 5})` }}>
      <div style={{ width: "100%", height: `${Math.min(progress, 1) * 100}%`, backgroundColor: "rgba(200, 200, 200, 0.8)", marginTop: "auto" }} />
    </div>
  );
}

export default function FileManager({ card }: { card: LayoutCard }) {
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const instanceId = getMetaOrRouteValue("instanceId") ?? "";
  const daemonId = getMetaOrRouteValue("daemonId") ?? "";
  const { isPhone } = useScreen();
  const { modal } = App.useApp();
  const fm = useFileManager(instanceId, daemonId);
  const upload = useUploadState();

  const [dragging, setDragging] = useState(false);
  const [editingPath, setEditingPath] = useState(false);
  const [tempPath, setTempPath] = useState("");
  const [search, setSearch] = useState("");
  const pathInputRef = useRef<InputRef>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial load, then poll task status every 3 s (upstream onMounted + setInterval).
  useEffect(() => {
    let alive = true;
    void (async () => {
      await fm.getFileStatus();
      if (!alive) return;
      const first = fm.currentTabs[0];
      if (first) {
        fm.activeTab = first.key;
        await fm.getFileList(false, first.path);
      } else {
        await fm.getFileList(false);
      }
    })();
    const timer = setInterval(() => void fm.getFileStatus(), STATUS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [fm]);

  useEffect(() => {
    if (editingPath) pathInputRef.current?.focus();
  }, [editingPath]);

  const { fileStatus, isMultiple, selectedRowKeys, operationForm, clipboard } = fm;
  const isShowDiskList = !!fileStatus?.disks?.length && fileStatus.platform === "win32" && fileStatus.isGlobalInstance;

  const editFile = (fileName: string) =>
    void openFileEditor({ daemonId, instanceId, path: fm.currentPath + fileName, fileName, onSave: () => void fm.getFileList(false, undefined, true) });

  const handleClickFile = (file: DataType) => {
    if (file.type === 0) return void fm.rowClickTable(file.name, file.type);
    if (fm.isImage(getFileExtName(file.name))) return fm.showImage(file);
    editFile(file.name);
  };

  const menuList = (record: DataType): MenuAction[] =>
    arrayFilter<MenuAction & ConditionFilterItem>([
      {
        label: t("TXT_CODE_b147fabc"),
        key: "new",
        icon: <PlusOutlined />,
        children: [
          { label: t("TXT_CODE_cfc657db"), key: "newFolder", icon: <FolderOutlined />, onClick: () => void fm.touchFile(true) },
          { label: t("TXT_CODE_1e0b63b6"), key: "newFile", icon: <FileOutlined />, onClick: () => void fm.touchFile() }
        ],
        condition: () => !isMultiple
      },
      { label: t("TXT_CODE_a64f3007"), key: "unzip", icon: <FileZipOutlined />, onClick: () => void fm.unzipFile(record.name), condition: () => record.type === 1 && isCompressFile(record.name) },
      { label: t("TXT_CODE_ad207008"), key: "edit", icon: <EditOutlined />, onClick: () => editFile(record.name), condition: () => !isMultiple && record.type === 1 },
      { label: t("TXT_CODE_65b21404"), key: "download", icon: <DownloadOutlined />, onClick: () => void fm.downloadFile(record.name), condition: () => !isMultiple && record.type === 1 },
      { label: t("TXT_CODE_46c4169b"), key: "cut", icon: <ScissorOutlined />, onClick: () => fm.setClipBoard("move") },
      { label: t("TXT_CODE_13ae6a93"), key: "copy", icon: <CopyOutlined />, onClick: () => fm.setClipBoard("copy") },
      { label: t("TXT_CODE_c83551f5"), key: "rename", icon: <FormOutlined />, onClick: () => void fm.resetName(record.name), condition: () => !isMultiple },
      { label: t("TXT_CODE_16853efe"), key: "changePermission", icon: <KeyOutlined />, onClick: () => void fm.changePermission(record.name, record.mode), condition: () => fileStatus?.platform !== "win32" },
      { label: t("TXT_CODE_88122886"), key: "zip", icon: <FileZipOutlined />, onClick: () => void fm.zipFile() },
      { label: t("TXT_CODE_ecbd7449"), key: "delete", icon: <DeleteOutlined />, style: { color: "var(--color-red-5)" }, onClick: () => fm.deleteFile(record.name) }
    ]);

  const columns: TableColumnsType<DataType> = arrayFilter<TableColumnsType<DataType>[number] & ConditionFilterItem>([
    {
      align: "left",
      title: t("TXT_CODE_94c193de"),
      dataIndex: "name",
      key: "name",
      render: (_: unknown, record: DataType) => (
        <Button type="link" className="file-name" onClick={() => handleClickFile(record)}>
          <span className="mr-4">{createElement(getFileIcon(record.name, record.type), { style: { fontSize: 16 } })}</span>
          {record.name}
        </Button>
      )
    },
    {
      align: "center",
      title: t("TXT_CODE_67d68dd1"),
      dataIndex: "type",
      key: "type",
      render: (v: number, record: DataType) => (v == 1 ? filterFileName(record.name) : t("TXT_CODE_e5f949c")),
      condition: () => !isPhone
    },
    {
      align: "center",
      title: t("TXT_CODE_94bb113a"),
      dataIndex: "size",
      key: "size",
      render: (v: number) => (v == 0 ? "--" : convertFileSize(v.toString())),
      condition: () => !isPhone
    },
    {
      align: "center",
      title: t("TXT_CODE_d3b29478"),
      dataIndex: "time",
      key: "time",
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm:ss"),
      condition: () => !isPhone
    },
    {
      align: "center",
      title: t("TXT_CODE_511aea70"),
      dataIndex: "mode",
      key: "mode",
      condition: () => !isPhone && fileStatus?.platform !== "win32"
    },
    {
      align: isPhone ? "center" : "right",
      title: t("TXT_CODE_fe731dfc"),
      dataIndex: "action",
      key: "action",
      condition: () => !isMultiple,
      render: (_: unknown, record: DataType) =>
        isPhone ? (
          <Dropdown menu={{ mode: "vertical", ...toMenuProps(menuList(record)) }}>
            <Button size="middle">
              {t("TXT_CODE_fe731dfc")}
              <DownOutlined />
            </Button>
          </Dropdown>
        ) : (
          <Space>
            {menuList(record)
              .filter((m) => !m.children)
              .map((item) => (
                <Tooltip key={item.key} title={item.label}>
                  <Button
                    icon={item.icon}
                    type="text"
                    size="small"
                    style={item.style}
                    onClick={() => {
                      fm.oneSelected(record.name, record);
                      item.onClick?.();
                    }}
                  />
                </Tooltip>
              ))}
          </Space>
        )
    }
  ]);

  // ---- path editing ----
  const enterEditPath = () => {
    setTempPath(fm.currentPath);
    setEditingPath(true);
  };
  const submitPathEdit = async () => {
    if (!editingPath) return;
    setEditingPath(false);
    if (!tempPath.trim()) return;
    let target = tempPath.trim().replace(/\\/g, "/");
    target = target.endsWith("/") ? target : target + "/";
    if (target === fm.currentPath) return;
    await fm.handleChangeDir(target);
  };

  // ---- uploads ----
  const processUploadItems = (files: File[], folders: FileSystemEntry[]) => {
    if (files.length === 0 && folders.length === 0) return;
    let name = "";
    for (const folder of folders) name += `[${t("TXT_CODE_e5f949c")}] ${folder.name}, `;
    for (const file of files) name += `${file.name}, `;
    name = name.slice(0, -2);
    if (name.length > 40) name = name.slice(0, 37) + "...";
    if (files.length + folders.length > 1) name += ` (${files.length + folders.length})`;
    modal.confirm({
      title: t("TXT_CODE_52bc24ec"),
      content: `${t("TXT_CODE_52bc24ec")} ${name} ?`,
      onOk() {
        if (files.length > 0) void fm.selectedFiles(files);
        for (const folder of folders) void fm.handleFolderUpload(folder);
      }
    });
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const items = e.dataTransfer?.items;
    if (!items) return;
    const files: File[] = [];
    const folders: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (!entry) continue;
      if (entry.isDirectory) folders.push(entry);
      else {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    processUploadItems(files, folders);
  };

  const onFolderInputChange = (input: HTMLInputElement) => {
    const files = Array.from(input.files || []);
    input.value = "";
    if (files.length === 0) return;
    const rootName = files[0].webkitRelativePath.split("/")[0];
    void fm.handleFolderUpload(
      files.map((f) => ({ path: f.webkitRelativePath, file: f, isDir: false })),
      rootName
    );
  };

  const onFileInputChange = (input: HTMLInputElement) => {
    const files = Array.from(input.files || []);
    input.value = "";
    if (files.length) void fm.selectedFiles(files);
  };

  const uploadProgress = upload.current ? (upload.current[0] * 100) / upload.current[1] : 0;
  const uploadInstanceTag =
    !upload.instanceInfo || upload.instanceInfo.instanceId != instanceId || upload.instanceInfo.daemonId != daemonId ? `(${t("TXT_CODE_59c0c994")})` : "";
  const downloadProgress = (task: { total: number; current: number }) => (task.total > 0 ? Number(((task.current / task.total) * 100).toFixed(2)) : 0);

  const downloadFromURLFile = async () => {
    const data = await openDownloadFileDialog();
    if (data) await fm.downloadFromUrl(data);
  };

  const emptyRecord: DataType = { name: "", type: 0, size: 0, time: "", mode: 0 };

  return (
    <div style={{ height: "100%" }} className="container InstanceFileManager">
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
                {selectedRowKeys.length > 0 && <Typography.Text>{`${t("TXT_CODE_7b2c5414")} ${String(selectedRowKeys.length)} ${t("TXT_CODE_5cd3b4bd")}`}</Typography.Text>}
                <Button type="dashed" onClick={() => void downloadFromURLFile()}>
                  <DownloadOutlined />
                  {t("TXT_CODE_5b364aef")}
                </Button>
                <Dropdown
                  menu={{
                    items: [
                      { key: "uploadFile", icon: <UploadOutlined />, label: t("TXT_CODE_e00c858c"), onClick: () => fileInputRef.current?.click() },
                      { key: "uploadFolder", icon: <FolderOutlined />, label: t("TXT_CODE_upload_folder"), onClick: () => folderInputRef.current?.click() }
                    ]
                  }}
                >
                  <Button type="dashed">
                    <UploadOutlined />
                    {t("TXT_CODE_e00c858c")}
                  </Button>
                </Dropdown>
                <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => onFileInputChange(e.currentTarget)} />
                <input
                  ref={(el) => {
                    folderInputRef.current = el;
                    // React does not know these attributes; set them on the element.
                    el?.setAttribute("webkitdirectory", "");
                    el?.setAttribute("directory", "");
                  }}
                  type="file"
                  style={{ display: "none" }}
                  onChange={(e) => onFolderInputChange(e.currentTarget)}
                />
                {clipboard?.value && clipboard.value.length > 0 ? (
                  <Button type="dashed" danger onClick={() => void fm.paste()}>
                    {t("TXT_CODE_f0260e51")}
                  </Button>
                ) : (
                  <Button type="default" onClick={() => void fm.reloadList()}>
                    {t("TXT_CODE_a53573af")}
                  </Button>
                )}
                {isMultiple ? (
                  <Dropdown menu={{ mode: "vertical", ...toMenuProps(menuList(emptyRecord)) }}>
                    <Button type="primary">
                      {t("TXT_CODE_5cb656b9")}
                      <DownOutlined />
                    </Button>
                  </Dropdown>
                ) : (
                  <Dropdown
                    menu={{
                      items: [
                        { key: "newFile", label: t("TXT_CODE_1e0b63b6"), onClick: () => void fm.touchFile() },
                        { key: "newFolder", label: t("TXT_CODE_cfc657db"), onClick: () => void fm.touchFile(true) }
                      ]
                    }}
                  >
                    <Button type="primary">
                      {t("TXT_CODE_b147fabc")}
                      <DownOutlined />
                    </Button>
                  </Dropdown>
                )}
              </>
            }
            center={
              <div className="search-input">
                <Input
                  value={search}
                  placeholder={t("TXT_CODE_7cad42a5")}
                  allowClear
                  suffix={<SearchOutlined />}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    // allow-clear fires a change with "": search immediately, like upstream.
                    if (!e.target.value) {
                      fm.setSearchName("");
                      fm.handleSearchChange();
                    }
                  }}
                  onBlur={() => {
                    if (search.trim() === operationForm.name) return;
                    fm.setSearchName(search.trim());
                    fm.handleSearchChange();
                  }}
                  onPressEnter={() => {
                    fm.setSearchName(search.trim());
                    fm.handleSearchChange();
                  }}
                />
              </div>
            }
          />
        </Col>

        <Col span={24}>
          <div
            style={{ height: "100%", opacity: dragging ? 0.4 : undefined }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragging(false);
            }}
            onDrop={handleDrop}
          >
            <CardPanel style={{ height: "100%" }}>
              {upload.current && (
                <>
                  <div className="flex-nowrap w-100">
                    <Typography.Text ellipsis>{`${upload.currentFile} ${uploadInstanceTag}`.trim()}</Typography.Text>
                    <Typography.Text style={{ paddingLeft: 5, whiteSpace: "nowrap" }}>
                      ({upload.files[0]}/{upload.files[1]})
                    </Typography.Text>
                    <div className="flex" style={{ marginLeft: 5, padding: 3, gap: 3 }}>
                      {upload.pieces.map((p, i) => (
                        <UploadTaskProgress key={i} progress={p.progress} retries={p.retries} />
                      ))}
                    </div>
                    {upload.suspending ? (
                      <CaretRightOutlined style={{ marginLeft: 5 }} onClick={() => uploadService.unsuspend()} />
                    ) : (
                      <PauseOutlined style={{ marginLeft: 5 }} onClick={() => uploadService.suspend()} />
                    )}
                    <CloseOutlined style={{ marginLeft: 5 }} onClick={() => void uploadService.stop()} />
                  </div>
                  <div className="flex-nowrap w-100">
                    <Progress strokeColor={PROGRESS_COLORS} percent={uploadProgress} showInfo={false} className="mb-20 no-animation" />
                    <Typography.Text style={{ paddingLeft: 2, whiteSpace: "nowrap" }}>
                      {convertFileSize(upload.current[0].toString())} / {convertFileSize(upload.current[1].toString())}
                    </Typography.Text>
                  </div>
                </>
              )}

              <Tabs
                activeKey={fm.activeTab}
                type="editable-card"
                onEdit={(key, action) => fm.onEditTabs(key, action)}
                onChange={(key) => void fm.handleChangeTab(key)}
                items={fm.currentTabs.map((b) => ({ key: b.key, label: b.name, closable: true }))}
              />

              <div className="flex-wrap items-flex-start">
                {isShowDiskList && (
                  <Select
                    value={fm.currentDisk}
                    className={isPhone ? "w-100 mb-10" : "mr-10"}
                    style={{ width: 125 }}
                    onChange={(v) => void fm.toDisk(v)}
                    options={[{ value: "/", label: t("TXT_CODE_28124988") }, ...(fileStatus?.disks ?? []).map((d) => ({ value: d, label: d }))]}
                  />
                )}
                {!editingPath ? (
                  <div className="file-breadcrumbs mb-20" onClick={enterEditPath}>
                    <Breadcrumb
                      separator=">"
                      items={fm.breadcrumbs.map((item) => ({
                        key: item.path,
                        title: (
                          <div
                            className="file-breadcrumbs-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              void fm.handleChangeDir(item.path);
                            }}
                          >
                            {item.name}
                          </div>
                        )
                      }))}
                    />
                  </div>
                ) : (
                  <Input
                    ref={pathInputRef}
                    value={tempPath}
                    className="file-breadcrumbs-input mb-20"
                    onChange={(e) => setTempPath(e.target.value)}
                    onBlur={() => void submitPathEdit()}
                    onPressEnter={() => void submitPathEdit()}
                  />
                )}
              </div>

              {fileStatus?.downloadTasks?.map((task) => (
                <div key={task.taskId}>
                  <div className="flex-nowrap w-100">
                    <Typography.Text ellipsis>{task.path.split(/[\\/]/).pop()}</Typography.Text>
                    {task.status === 0 && (
                      <CloseOutlined style={{ marginLeft: 5, cursor: "pointer", color: "#ff4d4f" }} onClick={() => void fm.stopDownloadFileFromUrl(task.taskId)} />
                    )}
                  </div>
                  <div className="flex-nowrap w-100">
                    <Progress strokeColor={PROGRESS_COLORS} percent={downloadProgress(task)} showInfo={false} className="mb-20" />
                    <Typography.Text style={{ paddingLeft: 2, whiteSpace: "nowrap" }}>
                      {convertFileSize(task.current.toString())} / {convertFileSize(task.total.toString())}
                    </Typography.Text>
                  </div>
                </div>
              ))}

              {!!fileStatus?.instanceFileTask && fileStatus.instanceFileTask > 0 && (
                <p style={{ color: "#1677ff" }}>
                  <Spin /> {t("TXT_CODE_dd06dea2") + fileStatus.instanceFileTask + t("TXT_CODE_3e959ce7")}
                </p>
              )}

              <Spin spinning={fm.spinning}>
                <Table<DataType>
                  rowSelection={{ selectedRowKeys, onChange: fm.selectChanged }}
                  rowKey={(record) => record.name}
                  dataSource={fm.dataSource}
                  columns={columns}
                  scroll={{ x: "max-content" }}
                  size="small"
                  pagination={{
                    current: operationForm.current,
                    pageSize: operationForm.pageSize,
                    total: operationForm.total,
                    hideOnSinglePage: false,
                    showSizeChanger: true,
                    size: "middle"
                  }}
                  onRow={(record) => ({
                    onContextMenu: (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      fm.oneSelected(record.name, record);
                      openRightClickMenu(e.clientX, e.clientY, menuList(record));
                    }
                  })}
                  onChange={(p) => fm.handleTableChange({ current: p.current || 0, pageSize: p.pageSize || 0 })}
                />
              </Spin>
            </CardPanel>
          </div>
        </Col>
      </Row>
    </div>
  );
}
