/**
 * Renders one layout card by looking up its `type` in the widget registry,
 * with an error boundary so one broken widget cannot blank the page
 * (port of LayoutCard.vue + CardError.vue).
 *
 * Security: `type` comes from the admin-editable layout JSON. Only types in
 * the static LAYOUT_CARD_TYPES map can render; anything else falls back to the
 * "not ported" card (CWE-20, no dynamic component loading by name).
 * Errors show the message only, never a stack (CWE-209).
 */
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { Skeleton, Typography } from "antd";
import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { LAYOUT_CARD_TYPES, NotPortedCard } from "@/config/widgets";
import { useLayoutContainer } from "@/stores/layoutContainer";
import { t } from "@/lang/i18n";
import type { LayoutCard as Card } from "@/types";
import CardPanel from "./CardPanel";

class CardErrorBoundary extends Component<{ card: Card; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Card: ${this.props.card.id}-${this.props.card.type}-${this.props.card.title} Error:`, error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    // Previews in the new-card dialog have no meta yet, so a failure there is expected (upstream CardError).
    if (useLayoutContainer.getState().showNewCardDialog)
      return (
        <CardPanel title={this.props.card.title}>
          <div className="flex justify-center align-center h-100">
            <Typography.Paragraph style={{ maxWidth: 320, margin: "auto", textAlign: "center" }}>
              <ExclamationCircleOutlined /> {t("TXT_CODE_450481c5")}
            </Typography.Paragraph>
          </div>
        </CardPanel>
      );
    return (
      <CardPanel title={this.props.card.title}>
        <div className="flex justify-center align-center h-100">
          <div>
            <Typography.Paragraph>
              <ExclamationCircleOutlined /> {t("TXT_CODE_4e627613")}
            </Typography.Paragraph>
            <Typography.Paragraph>
              <div>{t("TXT_CODE_9c95b60f")}</div>
              <pre>{this.state.error.message}</pre>
            </Typography.Paragraph>
          </div>
        </div>
      </CardPanel>
    );
  }
}

export default function LayoutCard({ card }: { card: Card }) {
  const Widget = Object.hasOwn(LAYOUT_CARD_TYPES, card.type) ? LAYOUT_CARD_TYPES[card.type] : NotPortedCard;
  return (
    <div id={`layout-card-container-${card.id}`} className="layout-card-container transition-all-6 global-drag-animation" style={{ width: "100%", height: "100%" }}>
      <CardErrorBoundary card={card}>
        {/* Widgets are lazy chunks (config/widgets.tsx); show the card frame while one loads. */}
        <Suspense
          fallback={
            <CardPanel title={card.title}>
              <Skeleton active paragraph={{ rows: 3 }} />
            </CardPanel>
          }
        >
          <Widget card={card} />
        </Suspense>
      </CardErrorBoundary>
    </div>
  );
}
