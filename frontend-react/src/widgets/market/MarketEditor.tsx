/**
 * Market template editor (port of widgets/market/editor.vue): load a market
 * JSON (panel source, file, link or clipboard), add, edit and delete
 * templates, then download it or publish it as the panel's market source.
 *
 * SECURITY:
 * - Imported JSON is untrusted: it is parsed with JSON.parse, checked to hold
 *   a packages array, and rendered as text; images go through safeHttpUrl.
 * - "Import from link" fetches with credentials omitted, so no panel cookie
 *   or session token leaves the browser (upstream used a bare axios instance).
 *   Only http(s) links are accepted (CWE-918 does not apply: the request is
 *   made by the admin's browser, not the panel).
 * - Publishing uploads the file to /api/overview/upload_assets and points the
 *   presetPackAddr setting at it; both routes are admin-only on the panel.
 */
import {
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileOutlined,
  InboxOutlined,
  LinkOutlined,
  PlusOutlined,
  SelectOutlined
} from "@ant-design/icons";
import { App, Button, Col, Dropdown, Flex, Popconfirm, Row, Select, Tag, Typography, Upload } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import CardPanel from "@/components/CardPanel";
import FadeUp from "@/components/FadeUp";
import Loading from "@/components/Loading";
import { useMarketPackages } from "@/hooks/useMarketPackages";
import { t } from "@/lang/i18n";
import { setSettingInfo, uploadAsset } from "@/services/apis/settings";
import { useAppTools } from "@/stores/appTools";
import { filterEmptyFields } from "@/tools/object";
import { safeHttpUrl } from "@/tools/safeUrl";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard, QuickStartPackages } from "@/types";
import { openTemplateEditDialog } from "@/widgets/instance/dialogs/InstanceDetail";

const sameTemplate = (a: QuickStartPackages, b: QuickStartPackages) =>
  a.targetLink === b.targetLink &&
  a.title === b.title &&
  a.gameType === b.gameType &&
  a.language === b.language &&
  a.platform === b.platform &&
  a.category === b.category;

/** Accept only `{ packages: [...] , languages?: [...] }`; anything else is a format error. */
function parseTemplateFile(data: unknown): IQuickStartTemplate {
  const obj = data as Partial<IQuickStartTemplate> | null;
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.packages)) throw new SyntaxError("invalid market file");
  return { packages: obj.packages, languages: Array.isArray(obj.languages) ? obj.languages : [] };
}

export default function MarketEditor(_props: { card: LayoutCard }) {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [query] = useSearchParams();
  const openInputDialog = useAppTools((s) => s.openInputDialog);
  const market = useMarketPackages();
  const {
    searchForm,
    patchSearch,
    packages,
    setPackages,
    setLanguageOptions,
    languageOptions,
    appListLoading,
    setAppListLoading,
    filteredList,
    rawList,
    gameTypeOptions,
    categoryOptions,
    platformOptions,
    handleReset,
    handleGameTypeChange,
    handleLanguageChange,
    handlePlatformChange,
    handleSelectTopCategory,
    fetchTemplate
  } = market;
  const [multipleMode, setMultipleMode] = useState(false);
  const [selected, setSelected] = useState<QuickStartPackages[]>([]);
  const [publishing, setPublishing] = useState(false);
  const isNewTemplate = Boolean(query.get("newTemplate"));
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (isNewTemplate) setPackages([]);
    else void fetchTemplate();
  }, [isNewTemplate, setPackages, fetchTemplate]);

  const load = (file: IQuickStartTemplate) => {
    setPackages(file.packages);
    setLanguageOptions(file.languages);
  };

  const beforeUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return void message.error(t("TXT_CODE_bddc37e2"));
      try {
        load(parseTemplateFile(JSON.parse(reader.result)));
      } catch {
        message.error(t("TXT_CODE_bddc37e2"));
      }
    };
    reader.onerror = () => void message.error(t("TXT_CODE_a62886b9"));
    reader.readAsText(file);
    return false;
  };

  const importFromLink = async (addr?: string) => {
    try {
      if (!addr) addr = await openInputDialog(t("TXT_CODE_ac10fe01")).catch(() => "");
      const url = safeHttpUrl(addr);
      if (!url || !/^https?:\/\//i.test(url)) return void message.error(t("TXT_CODE_ac10fe01"));
      setAppListLoading(true);
      const res = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      load(parseTemplateFile(await res.json()));
    } catch (err) {
      if (err instanceof SyntaxError) message.error(t("TXT_CODE_bddc37e2"));
      else reportErrorMsg(err);
    } finally {
      setAppListLoading(false);
    }
  };

  const importFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.startsWith("http")) return void importFromLink(text);
      load(parseTemplateFile(JSON.parse(text)));
    } catch (err) {
      const e = err as Error;
      if (e instanceof SyntaxError) message.error(t("TXT_CODE_bddc37e2"));
      else if (e?.name === "NotAllowedError") message.error(t("TXT_CODE_2a22c2ff"));
      else message.error(e?.message ?? String(err));
    }
  };

  const downloadMarketJson = () => {
    if (!packages.length) return void message.warning(t("TXT_CODE_8e223f23"));
    const blob = new Blob([JSON.stringify(rawList, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "market.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success(t("TXT_CODE_38fb23a8"));
  };

  const editTemplate = async (item?: QuickStartPackages) => {
    const index = item ? packages.findIndex((p) => sameTemplate(p, item)) : -1;
    const saved = await openTemplateEditDialog({
      item,
      gameTypeList: gameTypeOptions,
      platformList: platformOptions,
      categoryList: categoryOptions,
      languageOptions
    });
    if (!saved) return;
    const cleaned = filterEmptyFields(saved);
    setPackages((list) => (index < 0 ? [...list, cleaned] : list.map((p, i) => (i === index ? cleaned : p))));
  };

  const isSelected = (item: QuickStartPackages) => selected.some((i) => sameTemplate(i, item));
  const toggleSelect = (item: QuickStartPackages) =>
    setSelected((list) => (list.some((i) => sameTemplate(i, item)) ? list.filter((i) => !sameTemplate(i, item)) : [...list, item]));

  const handleSelectItem = (item: QuickStartPackages) => {
    if (item.isSummary) return;
    if (multipleMode) toggleSelect(item);
    else void editTemplate(item);
  };

  const selectAllItems = () => {
    if (filteredList.length === selected.length) return setSelected([]);
    setSelected((list) => [...list, ...filteredList.filter((i) => !i.isSummary && !list.some((s) => sameTemplate(s, i)))]);
  };

  const exitMultipleMode = () => {
    setMultipleMode(false);
    setSelected([]);
  };

  const batchDelete = () => {
    if (!selected.length) return void message.warning(t("TXT_CODE_72952e19"));
    setPackages((list) => list.filter((p) => !selected.some((s) => sameTemplate(s, p))));
    setSelected([]);
    message.success(t("TXT_CODE_28190dbc"));
  };

  const removeAll = () => {
    setPackages([]);
    setSelected([]);
  };

  const uploadToPanel = async () => {
    if (!packages.length) {
      const ok = await new Promise<boolean>((resolve) =>
        modal.confirm({
          title: t("TXT_CODE_617ce69c"),
          icon: <ExclamationCircleOutlined />,
          content: t("TXT_CODE_f88db280"),
          okText: t("TXT_CODE_d507abff"),
          cancelText: t("TXT_CODE_a0451c97"),
          onOk: () => resolve(true),
          onCancel: () => resolve(false)
        })
      );
      if (!ok) return;
    }
    const form = new FormData();
    form.append("file", new Blob([JSON.stringify(rawList, null, 2)], { type: "application/json" }), "market.json");
    setPublishing(true);
    try {
      const fileName = await uploadAsset({ data: form, timeout: Number.MAX_SAFE_INTEGER, errorAlert: false });
      await setSettingInfo({ data: { presetPackAddr: `public/upload_files/${fileName}` }, errorAlert: false });
      message.success(t("TXT_CODE_a7907771"));
      setTimeout(() => navigate("/market?newTemplate=true"), 500);
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setPublishing(false);
    }
  };

  const allSelected = filteredList.length !== 0 && filteredList.length === selected.length;
  const importMenu = useMemo(
    () => ({
      items: [
        {
          key: "file",
          label: (
            <Upload accept=".json" maxCount={1} showUploadList={false} beforeUpload={beforeUpload}>
              <FileOutlined /> {t("TXT_CODE_fd0cdf5d")}
            </Upload>
          )
        },
        { key: "link", icon: <LinkOutlined />, label: t("TXT_CODE_dfc4b650"), onClick: () => void importFromLink() },
        { key: "clip", icon: <CopyOutlined />, label: t("TXT_CODE_caaac421"), onClick: () => void importFromClipboard() }
      ]
    }),
    []
  );

  return (
    <>
      <Typography.Title level={4} className="mb-8">
        <EditOutlined /> {t("TXT_CODE_dfd4fc5a")}
      </Typography.Title>
      <Typography.Paragraph>
        <div>{t("TXT_CODE_372e7b9c")}</div>
      </Typography.Paragraph>
      <div className="ant-form ant-form-horizontal flex-wrap justify-between">
        <div className="flex-wrap gap-10">
          <div className="ant-form-item mb-0">
            <Button loading={publishing} onClick={() => void uploadToPanel()}>
              {t("TXT_CODE_592eff33")} <CopyOutlined />
            </Button>
          </div>
          <Dropdown
            menu={{
              items: [
                { key: "download", icon: <DownloadOutlined />, label: t("TXT_CODE_c5a46eba"), onClick: downloadMarketJson },
                {
                  key: "rm",
                  danger: true,
                  label: (
                    <Popconfirm title={t("TXT_CODE_276756b2")} onConfirm={removeAll}>
                      <span>
                        <DeleteOutlined /> {t("TXT_CODE_75da3f2d")}
                      </span>
                    </Popconfirm>
                  )
                }
              ]
            }}
          >
            <Button type="primary">
              {t("TXT_CODE_fe731dfc")} <DownOutlined />
            </Button>
          </Dropdown>
          {!packages.length && (
            <Dropdown menu={importMenu}>
              <Button className="button-color-warning">
                {t("TXT_CODE_1df9fbd5")} <DownOutlined />
              </Button>
            </Dropdown>
          )}
        </div>

        <div className="flex-center gap-10">
          {multipleMode ? (
            <>
              <div className="ant-form-item mb-0">
                <div style={{ padding: 8 }}>
                  {t("TXT_CODE_379fa48a")}: {selected.length} {t("TXT_CODE_5cd3b4bd")}
                </div>
              </div>
              <div className="ant-form-item mb-0">
                <Button size="large" onClick={exitMultipleMode}>
                  {t("TXT_CODE_5366af54")}
                </Button>
              </div>
              <div className="ant-form-item mb-0">
                <Button size="large" onClick={selectAllItems}>
                  {allSelected ? t("TXT_CODE_df87c46d") : t("TXT_CODE_f466d7a")}
                </Button>
              </div>
              <Dropdown menu={{ items: [{ key: "del", icon: <DeleteOutlined />, label: t("TXT_CODE_ecbd7449"), onClick: batchDelete }] }}>
                <Button size="large" type="primary">
                  {t("TXT_CODE_8fd8bfd3")} <DownOutlined />
                </Button>
              </Dropdown>
            </>
          ) : (
            <div className="ant-form-item mb-0">
              <Button size="large" onClick={() => setMultipleMode(true)}>
                {t("TXT_CODE_5cb656b9")}
              </Button>
            </div>
          )}
          <div className="ant-form-item mb-0">
            <Button className="button-color-success" size="large" onClick={() => void editTemplate()}>
              {t("TXT_CODE_3d45d8d")} <PlusOutlined />
            </Button>
          </div>
        </div>
      </div>

      <Typography.Title level={4} className="mb-8 mt-30">
        <DatabaseOutlined /> {t("TXT_CODE_88249aee")}
      </Typography.Title>
      <Typography.Paragraph>
        <Flex justify="space-between" align="flex-start">
          <p>
            <span>{t("TXT_CODE_c9ce7427")}</span>
          </p>
        </Flex>
      </Typography.Paragraph>

      {appListLoading ? (
        <Row gutter={[24, 24]} style={{ height: "100%" }}>
          <Col span={24}>
            <div style={{ height: "50vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div>
                <Loading />
              </div>
              <div style={{ marginTop: 20, color: "var(--color-gray-12)" }}>{t("TXT_CODE_7fca723a")}</div>
            </div>
          </Col>
        </Row>
      ) : (
        <Row gutter={[16, 16]}>
          <Col span={24} md={24}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div className="ant-form-item mb-0">
                <Select style={{ width: 200 }} value={searchForm.language} placeholder={t("TXT_CODE_8a30e150")} options={languageOptions} onChange={handleLanguageChange} />
              </div>
              <div className="ant-form-item mb-0">
                <Select style={{ width: 200 }} value={searchForm.gameType} placeholder={t("TXT_CODE_107695d")} options={gameTypeOptions} onChange={handleGameTypeChange} />
              </div>
              <div className="ant-form-item mb-0">
                <Select style={{ width: 200 }} value={searchForm.platform} placeholder={t("TXT_CODE_47203b64")} options={platformOptions} onChange={handlePlatformChange} />
              </div>
              <div className="ant-form-item mb-0">
                <Select style={{ width: 200 }} value={searchForm.category} placeholder={t("TXT_CODE_ebbb2def")} options={categoryOptions} onChange={(category) => patchSearch({ category })} />
              </div>
              <div className="ant-form-item mb-0">
                <Button onClick={handleReset}>{t("TXT_CODE_880fedf7")}</Button>
              </div>
            </div>
          </Col>

          {filteredList.length === 0 && (
            <Col span={24}>
              <div className="flex-center flex-col my-50 m-auto" style={{ width: "40svw" }}>
                <Typography.Paragraph style={{ color: "var(--color-gray-7)" }}>{t("TXT_CODE_7356e569")}</Typography.Paragraph>
                {packages.length === 0 && (
                  <Upload.Dragger className="w-full" accept=".json" maxCount={1} beforeUpload={beforeUpload} showUploadList={false}>
                    <div className="flex-center flex-col h-full">
                      <p className="ant-upload-drag-icon">
                        <InboxOutlined />
                      </p>
                      <p className="ant-upload-text">{t("TXT_CODE_8e16ee21")}</p>
                      <p className="ant-upload-hint">{t("TXT_CODE_e1c60611")}</p>
                    </div>
                  </Upload.Dragger>
                )}
              </div>
            </Col>
          )}

          <FadeUp>
            {filteredList.map((item) => {
              const image = safeHttpUrl(item.image);
              return (
                <Col key={item.key ?? `${item.targetLink}-${item.title}-${item.language}-${item.platform}`} span={24} sm={24} md={12} lg={item.isSummary ? 8 : 6}>
                  <div style={{ display: "flex", flexGrow: 1, flexDirection: "column", height: "100%" }}>
                    {item.isSummary ? (
                      <div
                        className="package-image-container-summary global-card-container-shadow"
                        style={{ overflow: "hidden" }}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectTopCategory(item)}
                        onKeyDown={(e) => e.key === "Enter" && handleSelectTopCategory(item)}
                      >
                        <div className="package-image-container" style={{ borderRadius: 0 }}>
                          {image && <img className="package-image cursor-pointer" style={{ height: 220, borderRadius: 0 }} src={image} alt="" referrerPolicy="no-referrer" />}
                        </div>
                        <Typography.Title level={5} className="flex-center package-subtitle mb-0">
                          <span>{item.title}</span>
                        </Typography.Title>
                      </div>
                    ) : (
                      <CardPanel style={{ flexGrow: 1, padding: 12 }} className={multipleMode && isSelected(item) ? "selected" : undefined}>
                        <div className="package-card-content">
                          <div className="package-image-container">{image && <img className="package-image cursor-pointer" src={image} alt="" referrerPolicy="no-referrer" />}</div>
                          <div className="package-info">
                            <Typography.Title level={5} className="justify-between">
                              <span>{item.title}</span>
                              <span>
                                {item.platform && (
                                  <Tag color="cyan">{String(item.platform).toLowerCase() === "all" ? t("TXT_CODE_all_platform") : item.platform}</Tag>
                                )}
                              </span>
                            </Typography.Title>
                            <div className="mb-5">
                              {(Array.isArray(item.tags) ? item.tags : []).map((tag) => (
                                <Tag key={tag} color="blue">
                                  {tag}
                                </Tag>
                              ))}
                            </div>
                            <Typography.Paragraph>
                              <Typography.Text style={{ fontSize: 12 }}>
                                <p>
                                  <span>{item.description || " "}</span>
                                </p>
                                {item.runtime && (
                                  <p>
                                    <span style={{ opacity: 0.6 }}>{t("TXT_CODE_18b94497")}: </span>
                                    <span>{item.runtime}</span>
                                  </p>
                                )}
                                {item.hardware && (
                                  <p>
                                    <span style={{ opacity: 0.6 }}>{t("TXT_CODE_683e3033")}: </span>
                                    <span>{item.hardware}</span>
                                  </p>
                                )}
                              </Typography.Text>
                            </Typography.Paragraph>
                          </div>
                          <div className="package-action">
                            <Button
                              block
                              type="primary"
                              className="download-button"
                              icon={multipleMode ? <SelectOutlined /> : <DownloadOutlined />}
                              onClick={() => handleSelectItem(item)}
                            >
                              {multipleMode ? (isSelected(item) ? t("TXT_CODE_abedfd03") : t("TXT_CODE_7b2c5414")) : t("TXT_CODE_1704ea49")}
                            </Button>
                          </div>
                        </div>
                      </CardPanel>
                    )}
                  </div>
                </Col>
              );
            })}
          </FadeUp>
        </Row>
      )}
    </>
  );
}
