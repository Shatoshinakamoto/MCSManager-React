/** Design-mode controls overlay for one card: delete, resize, rename (port of CardOperator.vue). */
import { CloseOutlined, EditOutlined, VerticalAlignTopOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import type { CSSProperties, ReactNode } from "react";
import { useLocation } from "react-router";
import { LayoutCardHeight } from "@/config/cardPool";
import { t } from "@/lang/i18n";
import { useAppTools } from "@/stores/appTools";
import { useLayoutConfig } from "@/stores/layoutConfig";
import type { LayoutCard } from "@/types";
import "./CardOperator.scss";

// Tallest first, same order as upstream useCardOperation LEVEL_LIST.
const LEVELS = [LayoutCardHeight.LARGE, LayoutCardHeight.BIG, LayoutCardHeight.MEDIUM, LayoutCardHeight.SMALL, LayoutCardHeight.MINI] as string[];

export default function CardOperator({ card, page }: { card: LayoutCard; page?: string }) {
  const { pathname } = useLocation();
  const p = page ?? pathname;
  const { deleteItem, updateItem } = useLayoutConfig();
  const openInputDialog = useAppTools((s) => s.openInputDialog);
  const level = LEVELS.indexOf(card.height);
  const isAuto = card.height === LayoutCardHeight.AUTO;

  const btns: { tip: string; icon: ReactNode; click: () => void; style?: CSSProperties; show?: boolean }[] = [
    { tip: t("TXT_CODE_153f705d"), icon: <CloseOutlined />, click: () => deleteItem(p, card.id), show: card.disableDelete !== true },
    { tip: t("TXT_CODE_fd5ca298"), icon: <VerticalAlignTopOutlined />, style: { transform: "rotate(0deg)" }, show: !isAuto,
      click: () => level >= 0 && LEVELS[level + 1] && updateItem(p, card.id, { height: LEVELS[level + 1] }) },
    { tip: t("TXT_CODE_5db4e96b"), icon: <VerticalAlignTopOutlined />, style: { transform: "rotate(180deg)" }, show: !isAuto,
      click: () => level > 0 && updateItem(p, card.id, { height: LEVELS[level - 1] }) },
    { tip: t("TXT_CODE_d356cf9d"), icon: <VerticalAlignTopOutlined />, style: { transform: "rotate(270deg)" },
      click: () => card.width > 1 && updateItem(p, card.id, { width: card.width - 1 }) },
    { tip: t("TXT_CODE_baa16e45"), icon: <VerticalAlignTopOutlined />, style: { transform: "rotate(90deg)" },
      click: () => card.width < 12 && updateItem(p, card.id, { width: card.width + 1 }) },
    { tip: t("TXT_CODE_18cdc17f"), icon: <EditOutlined />,
      click: () => openInputDialog(t("TXT_CODE_b128afa6")).then((title) => updateItem(p, card.id, { title: String(title) }), () => undefined) }
  ];

  return (
    <>
      <div className="layout-card-design-btn">
        {btns.filter((b) => b.show !== false).map((b, i) => (
          <Tooltip key={i} placement="left" title={b.tip}>
            <Button style={b.style} type="text" size="small" icon={b.icon} onClick={b.click} />
          </Tooltip>
        ))}
      </div>
      <div className="number-card">
        <div className="number-card-H">
          <span>{t("TXT_CODE_1f246be3")} {card.height}</span>
        </div>
        <div className="number-card-W">
          <span>{t("TXT_CODE_108ce2e4")} <span>{card.width}/12</span> {t("TXT_CODE_3efe364e")}</span>
        </div>
      </div>
    </>
  );
}
