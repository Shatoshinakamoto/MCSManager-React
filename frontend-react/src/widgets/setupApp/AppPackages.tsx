/**
 * Market browser: category cards, then a filtered template table (port of
 * widgets/setupApp/AppPackages.vue).
 *
 * The parent owns the useMarketPackages state (upstream reached into this
 * component through a template ref instead) and passes it in as `market`.
 *
 * SECURITY: titles render as text; category images load only from http(s)
 * URLs (safeHttpUrl, CWE-79) with no referrer.
 */
import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Col, Input, Row, Select, Typography } from "antd";
import { useEffect } from "react";
import FadeUp from "@/components/FadeUp";
import Loading from "@/components/Loading";
import { SEARCH_ALL_KEY, type useMarketPackages } from "@/hooks/useMarketPackages";
import { t } from "@/lang/i18n";
import { safeHttpUrl } from "@/tools/safeUrl";
import type { QuickStartPackages } from "@/types";
import PackageDetailTable, { type InstallType } from "./PackageDetailTable";
import "./AppPackages.scss";

export type MarketState = ReturnType<typeof useMarketPackages>;

export default function AppPackages({
  market,
  btnText,
  showCustomBtn,
  onSelectTemplate,
  onSelectCategory,
  onBackToCategory
}: {
  market: MarketState;
  btnText?: string;
  showCustomBtn?: boolean;
  onSelectTemplate: (item: QuickStartPackages, type: InstallType) => void;
  onSelectCategory: (item: QuickStartPackages) => void;
  onBackToCategory?: () => void;
}) {
  const { searchForm, patchSearch, appListLoading, filteredList, platformOptions, fetchTemplate } = market;
  const isCategoryView = searchForm.gameType === SEARCH_ALL_KEY;
  const detailList = isCategoryView ? [] : filteredList;

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  const backToCategory = () => {
    patchSearch({ gameType: SEARCH_ALL_KEY, platform: SEARCH_ALL_KEY });
    onBackToCategory?.();
  };

  if (appListLoading) {
    return (
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
    );
  }

  return (
    <Row gutter={[16, 16]} style={{ height: "100%" }}>
      {showCustomBtn && (
        <Col span={24} md={24} className="justify-end">
          <Button type="link" style={{ margin: 0, padding: 0 }}>
            {t("TXT_CODE_181c72ba")}
          </Button>
        </Col>
      )}
      <Col span={24}>
        <div className="detail-search-bar">
          <Select
            value={searchForm.platform}
            options={platformOptions}
            placeholder={t("TXT_CODE_47203b64")}
            className="detail-search-platform"
            style={{ minWidth: 140 }}
            onChange={(platform) => patchSearch({ platform })}
          />
          <Input
            value={searchForm.keyword}
            placeholder={t("TXT_CODE_ce132192")}
            className="detail-search-keyword"
            style={{ maxWidth: 280 }}
            onChange={(e) => patchSearch({ keyword: e.target.value })}
          />
          {detailList.length > 0 && (
            <Button icon={<ArrowLeftOutlined />} onClick={backToCategory}>
              {t("TXT_CODE_c14b2ea3")}
            </Button>
          )}
        </div>
      </Col>

      {filteredList.length === 0 ? (
        <Col span={24}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "40vh" }}>
            <Typography.Paragraph style={{ color: "var(--color-gray-7)" }}>{t("TXT_CODE_7356e569")}</Typography.Paragraph>
          </div>
        </Col>
      ) : detailList.length > 0 ? (
        <Col span={24}>
          <PackageDetailTable dataSource={detailList} btnText={btnText} onSelect={onSelectTemplate} />
        </Col>
      ) : (
        <FadeUp delay={60}>
          {filteredList.map((item) => {
            const image = safeHttpUrl(item.image);
            return (
              <Col key={item.key} span={24} sm={24} md={12} lg={8}>
                <div
                  className="package-image-container-summary global-card-container-shadow"
                  style={{ overflow: "hidden", cursor: "pointer" }}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectCategory(item)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelectCategory(item))}
                >
                  <div className="package-image-container" style={{ borderRadius: 0 }}>
                    {image && <img className="package-image cursor-pointer" style={{ height: 220, borderRadius: 0 }} src={image} alt="" referrerPolicy="no-referrer" />}
                  </div>
                  <Typography.Title level={5} className="flex-center package-subtitle mb-0">
                    <span>{item.title}</span>
                  </Typography.Title>
                </div>
              </Col>
            );
          })}
        </FadeUp>
      )}
    </Row>
  );
}
