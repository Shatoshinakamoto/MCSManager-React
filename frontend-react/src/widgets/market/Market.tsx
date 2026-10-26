/**
 * App market page (port of widgets/market/index.vue): manual install options
 * for admins, the template market (McPreset) and a first-visit tour.
 */
import { AppstoreAddOutlined, BlockOutlined, DatabaseOutlined, FileZipOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { Col, Divider, Flex, Modal, Row, Tour, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router";
import { openNodeSelectDialog } from "@/components/fc/NodeSelectDialog";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { QUICKSTART_METHOD } from "@/hooks/quickStartFlow";
import { t } from "@/lang/i18n";
import { useIsAdmin } from "@/stores/appState";
import type { LayoutCard } from "@/types";
import CreateInstanceForm from "@/widgets/setupApp/CreateInstanceForm";
import McPreset from "@/widgets/setupApp/McPreset";
import InstallOptionButton, { type InstallOption } from "./InstallOptionButton";
import { useMarketTour } from "./useMarketTour";
import "./Market.scss";

export default function Market({ card }: { card: LayoutCard }) {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const { step3Ref, openTour, tourCurrent, setTourCurrent, tourSteps, setStepRef, markTourDone } = useMarketTour(isAdmin);
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const [form, setForm] = useState({ createMethod: QUICKSTART_METHOD.DOCKER, daemonId: getMetaOrRouteValue("daemonId", false) ?? "" });
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleNext = (instanceUuid: string) => {
    setShowCreateForm(false);
    navigate(`/instances/terminal?${new URLSearchParams({ daemonId: form.daemonId, instanceId: instanceUuid })}`);
  };

  const handleInstallAction = async (createMethod: QUICKSTART_METHOD) => {
    const node = await openNodeSelectDialog();
    if (!node) return;
    setForm({ createMethod, daemonId: node.uuid });
    setShowCreateForm(true);
  };

  const manualInstallOptions: InstallOption[] = [
    { label: t("TXT_CODE_a3efb1cc"), icon: FileZipOutlined, description: t("TXT_CODE_f09da050"), action: () => void handleInstallAction(QUICKSTART_METHOD.IMPORT) },
    { label: t("TXT_CODE_bae487e4"), icon: BlockOutlined, description: t("TXT_CODE_256e5825"), action: () => void handleInstallAction(QUICKSTART_METHOD.DOCKER) },
    { label: t("TXT_CODE_e0fca76"), icon: FolderOpenOutlined, description: t("TXT_CODE_b3844cf8"), action: () => void handleInstallAction(QUICKSTART_METHOD.EXIST) }
  ];

  return (
    <div style={{ height: "100%" }}>
      {isAdmin && (
        <div style={{ marginBottom: 30 }}>
          <Typography.Title level={4} style={{ marginBottom: 8 }}>
            <AppstoreAddOutlined /> {t("TXT_CODE_5a74975b")}
          </Typography.Title>
          <Typography.Paragraph>
            <p style={{ opacity: 0.6 }}>{t("TXT_CODE_81ad9e80")}</p>
          </Typography.Paragraph>
          <div className="manual-install-options">
            <Row gutter={[16, 16]}>
              {manualInstallOptions.map((option, index) => (
                <Col key={option.label} span={24} md={12} lg={8}>
                  <div ref={(el) => setStepRef(index, el)}>
                    <InstallOptionButton option={option} />
                  </div>
                </Col>
              ))}
            </Row>
          </div>
        </div>
      )}
      <div>
        <div ref={step3Ref}>
          <Typography.Title level={4} style={{ marginBottom: 8 }}>
            <DatabaseOutlined /> {t("TXT_CODE_88249aee")}
          </Typography.Title>
          <Typography.Paragraph>
            <Flex justify="space-between" align="flex-start">
              <p style={{ opacity: 0.6 }}>
                <span>{t("TXT_CODE_c9ce7427")}</span>
              </p>
              {/* A div, not <p>: the vertical Divider renders a <div>, which <p> may not contain. */}
              <div className="market-links">
                <Typography.Link
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/market/editor");
                  }}
                >
                  {t("TXT_CODE_85c10fde")}
                </Typography.Link>
                <Divider orientation="vertical" />
                <Typography.Link href="https://github.com/MCSManager/Script/issues/77" target="_blank" rel="noopener noreferrer">
                  {t("TXT_CODE_709c2db4")}
                </Typography.Link>
              </div>
            </Flex>
          </Typography.Paragraph>
        </div>
        <McPreset card={card} />
      </div>

      <Tour open={openTour} current={tourCurrent} onChange={setTourCurrent} steps={tourSteps} onClose={markTourDone} onFinish={markTourDone} />

      <Modal open={showCreateForm} title={t("TXT_CODE_645bc545")} width={1000} footer={null} destroyOnHidden onCancel={() => setShowCreateForm(false)}>
        <CreateInstanceForm key={`${form.createMethod}-${form.daemonId}`} createMethod={form.createMethod} daemonId={form.daemonId} onNextStep={handleNext} />
      </Modal>
    </div>
  );
}
