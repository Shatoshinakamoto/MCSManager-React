/**
 * Quick start wizard card (port of widgets/setupApp/QuickStartFlow.vue):
 * app type, node, create method, then CreateInstanceForm, then shortcuts.
 *
 * `?appType=` and `?createMethod=` in the URL jump ahead, as upstream; only
 * values that are members of the enums are honoured.
 */
import { Col, Row, Typography } from "antd";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import ActionButton from "@/components/ActionButton";
import CardPanel from "@/components/CardPanel";
import FadeUp from "@/components/FadeUp";
import Loading from "@/components/Loading";
import { QUICKSTART_ACTION_TYPE, QUICKSTART_METHOD, useQuickStartFlow } from "@/hooks/quickStartFlow";
import { useScreen } from "@/hooks/useScreen";
import type { LayoutCard } from "@/types";
import CreateInstanceForm from "./CreateInstanceForm";
import "./QuickStartFlow.scss";

const isEnumValue = <T extends Record<string, string>>(e: T, v: string | null): v is T[keyof T] => v != null && Object.values(e).includes(v);

export default function QuickStartFlow({ card }: { card: LayoutCard }) {
  const { isPhone } = useScreen();
  const [query] = useSearchParams();
  const { formData, toStep2, toStep3, toStep4, toStep5, isLoading, isFormStep, isNormalStep } = useQuickStartFlow();
  const presetDone = useRef(false);

  useEffect(() => {
    if (presetDone.current) return;
    presetDone.current = true;
    const appType = query.get("appType");
    const createMethod = query.get("createMethod");
    if (isEnumValue(QUICKSTART_ACTION_TYPE, appType)) void toStep2(appType);
    if (isEnumValue(QUICKSTART_METHOD, createMethod)) toStep4(createMethod);
  }, [query, toStep2, toStep4]);

  const handleNext = (key: string) => {
    if (formData.step === 1) return void toStep2(key as QUICKSTART_ACTION_TYPE);
    if (formData.step === 2) return toStep3(key);
    if (formData.step === 3) return toStep4(key as QUICKSTART_METHOD);
    if (formData.step === 4) return toStep5(key);
  };

  const Icon = formData.icon;

  return (
    <CardPanel title={card.title} className="quickstart-card-wrapper" style={{ height: "100%" }}>
      {!isLoading ? (
        <div className="pd-24 h-100">
          {isNormalStep ? (
            <Row gutter={[24, 24]} className="h-100">
              {!isPhone && (
                <Col lg={12}>
                  <div className="quickstart-icon flex-center h-100">
                    <span key={formData.step} className="quickstart-icon-enter">
                      <Icon />
                    </span>
                  </div>
                </Col>
              )}
              <Col lg={12}>
                <div className="text-left" style={{ textAlign: "left" }}>
                  <Typography.Title level={5} className="mb-24">
                    {formData.title}
                  </Typography.Title>
                  <div style={{ maxHeight: 400, overflowX: "hidden" }}>
                    {formData.actions?.length === 0 && <Typography.Paragraph>{formData.emptyActionsText}</Typography.Paragraph>}
                    <Row gutter={[12, 12]}>
                      <FadeUp key={formData.step}>
                        {(formData.actions ?? []).map((action) => (
                          <ActionButton
                            key={action.key}
                            title={action.title}
                            icon={action.icon}
                            click={() => (action.click ? action.click() : handleNext(action.key))}
                          />
                        ))}
                      </FadeUp>
                    </Row>
                  </div>
                </div>
              </Col>
            </Row>
          ) : (
            isFormStep &&
            formData.appType &&
            formData.createMethod && (
              <div>
                <CreateInstanceForm createMethod={formData.createMethod} daemonId={formData.daemonId ?? ""} onNextStep={handleNext} />
              </div>
            )
          )}
        </div>
      ) : (
        <div className="loading flex-center w-100 h-100">
          <Loading />
        </div>
      )}
    </CardPanel>
  );
}
