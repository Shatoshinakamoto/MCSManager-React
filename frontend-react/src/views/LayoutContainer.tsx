/**
 * Renders the current route's cards on the 12-column grid (port of
 * views/LayoutContainer.vue + hooks/useCardDragMove.ts). Card widths double
 * onto antd's 24-column grid exactly as upstream (`lg = width * 2`).
 *
 * In design mode cards can be dragged onto another card (insert before it)
 * or onto a placeholder gap (insert after the card it follows), and each card
 * shows the CardOperator controls on hover.
 *
 * Security: drag data is parsed with JSON.parse inside try/catch and only its
 * `id` string is used to look up an existing card on this page (CWE-20);
 * dropping foreign data does nothing.
 */
import { Col, Row } from "antd";
import { useState, type DragEvent } from "react";
import { useLocation } from "react-router";
import CardOperator from "@/components/CardOperator";
import LayoutCard from "@/components/LayoutCard";
import NewCardList from "@/components/NewCardList";
import { computeCardLayout, PLACE_HOLDER_CARD } from "@/hooks/cardLayout";
import { useScreen } from "@/hooks/useScreen";
import { useLayoutConfig } from "@/stores/layoutConfig";
import { useLayoutContainer } from "@/stores/layoutContainer";
import "./LayoutContainer.scss";

function readDragId(e: DragEvent): string | undefined {
  try {
    const id = JSON.parse(e.dataTransfer.getData("text/plain") || "{}")?.id;
    return typeof id === "string" ? id : undefined;
  } catch {
    return undefined;
  }
}

export default function LayoutContainer({ page }: { page?: string }) {
  const { pathname } = useLocation();
  const pageKey = page ?? pathname;
  const items = useLayoutConfig((s) => s.getPageItems(pageKey));
  const moveItem = useLayoutConfig((s) => s.moveItem);
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const { isPhone } = useScreen();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const dragProps = (id: string, isPlaceholder: boolean, followId?: string) =>
    isDesignMode
      ? {
          draggable: !isPlaceholder,
          onDragStart: (e: DragEvent) => {
            if (isPlaceholder) return e.preventDefault();
            e.dataTransfer.setData("text/plain", JSON.stringify({ id }));
          },
          onDragOver: (e: DragEvent) => e.preventDefault(),
          onDragEnter: (e: DragEvent) => {
            e.preventDefault();
            setDragOverId(id);
          },
          onDragLeave: (e: DragEvent) => {
            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOverId(null);
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            setDragOverId(null);
            const sourceId = readDragId(e);
            if (!sourceId) return;
            if (isPlaceholder) moveItem(pageKey, sourceId, String(followId), true);
            else moveItem(pageKey, sourceId, id);
          }
        }
      : {};

  if (items.length === 0) return <main className="main-layout-container">{isDesignMode && <NewCardList />}</main>;

  if (items.length === 1) {
    const card = items[0];
    return (
      <main className="main-layout-container">
        {isDesignMode && <NewCardList />}
        <div className={isPhone ? undefined : "main-flex-center"}>
          <Row gutter={[0, 0]} align="middle" justify="center" style={{ width: "100%" }}>
            <Col span={24} md={24} lg={card.width * 2} className="layout-card-col transition-all-6" style={{ minHeight: card.height }}>
              {isDesignMode && <CardOperator card={card} page={pageKey} />}
              <LayoutCard card={card} />
            </Col>
          </Row>
        </div>
      </main>
    );
  }

  return (
    <main className="main-layout-container">
      {isDesignMode && <NewCardList />}
      <Row gutter={[24, 24]} className={isDesignMode ? "row-order-mode" : undefined}>
        {computeCardLayout(items).map((card) => {
          const isPlaceholder = card.type === PLACE_HOLDER_CARD;
          return (
            <Col
              key={card.id}
              span={24}
              md={24}
              lg={card.width * 2}
              className={["layout-card-col", isDesignMode && "is-order-mode"].filter(Boolean).join(" ")}
              data-card-type={card.type}
              style={{ minHeight: card.height }}
              onMouseEnter={() => setHoverId(card.id)}
              onMouseLeave={() => setHoverId((h) => (h === card.id ? null : h))}
            >
              {isDesignMode && !isPlaceholder && hoverId === card.id && <CardOperator card={card} page={pageKey} />}
              <div {...dragProps(card.id, isPlaceholder, card.followId)} style={{ height: "100%" }}
                className={dragOverId === card.id ? (isPlaceholder ? "global-placeholder-card-dragover" : "global-layout-card-dragover") : undefined}>
                {isPlaceholder ? (
                  <div className="global-drag-animation global-placeholder-card" style={{ height: "100%", width: "100%" }} />
                ) : (
                  <LayoutCard card={card} />
                )}
              </div>
            </Col>
          );
        })}
      </Row>
    </main>
  );
}
