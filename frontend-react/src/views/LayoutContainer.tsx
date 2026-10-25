/**
 * Renders the current route's cards on the 12-column grid (port of
 * views/LayoutContainer.vue). Card widths double onto antd's 24-column grid
 * exactly as upstream (`lg = width * 2`).
 *
 * TODO(port, phase 1): design-mode drag-and-drop, CardOperator and the
 * new-card dialog (useCardDragMove, NewCardList).
 */
import { Col, Row } from "antd";
import { useLocation } from "react-router";
import LayoutCard from "@/components/LayoutCard";
import { computeCardLayout, PLACE_HOLDER_CARD } from "@/hooks/cardLayout";
import { useScreen } from "@/hooks/useScreen";
import { useLayoutConfig } from "@/stores/layoutConfig";
import { useLayoutContainer } from "@/stores/layoutContainer";
import "./LayoutContainer.scss";

export default function LayoutContainer({ page }: { page?: string }) {
  const { pathname } = useLocation();
  const items = useLayoutConfig((s) => s.getPageItems(page ?? pathname));
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const { isPhone } = useScreen();

  if (items.length === 0) return <main className="main-layout-container" />;

  if (items.length === 1) {
    const card = items[0];
    return (
      <main className="main-layout-container">
        <div className={isPhone ? undefined : "main-flex-center"}>
          <Row gutter={[0, 0]} align="middle" justify="center" style={{ width: "100%" }}>
            <Col span={24} md={24} lg={card.width * 2} className="layout-card-col transition-all-6" style={{ minHeight: card.height }}>
              <LayoutCard card={card} />
            </Col>
          </Row>
        </div>
      </main>
    );
  }

  return (
    <main className="main-layout-container">
      <Row gutter={[24, 24]} className={isDesignMode ? "row-order-mode" : undefined}>
        {computeCardLayout(items).map((card) => (
          <Col
            key={card.id}
            span={24}
            md={24}
            lg={card.width * 2}
            className={["layout-card-col", isDesignMode && "is-order-mode"].filter(Boolean).join(" ")}
            data-card-type={card.type}
            style={{ minHeight: card.height }}
          >
            {card.type !== PLACE_HOLDER_CARD && <LayoutCard card={card} />}
          </Col>
        ))}
      </Row>
    </main>
  );
}
