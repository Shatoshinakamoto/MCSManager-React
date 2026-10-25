/**
 * Card chrome used by every widget (port of upstream CardPanel.vue).
 * Same class names, so the copied global SCSS styles it identically.
 */
import { Typography } from "antd";
import type { CSSProperties, ReactNode } from "react";
import { useLayoutContainer } from "@/stores/layoutContainer";
import "./CardPanel.scss";

interface Props {
  title?: ReactNode;
  operator?: ReactNode;
  /** Extra operator controls shown only in design mode. */
  operatorDesign?: ReactNode;
  children?: ReactNode;
  /** Extra body content shown only in design mode. */
  bodyDesign?: ReactNode;
  fullHeight?: boolean;
  padding?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Vue passed @click through to the root element; React needs it explicitly. */
  onClick?: () => void;
}

export default function CardPanel({ title, operator, operatorDesign, children, bodyDesign, fullHeight = true, padding = true, className, style, onClick }: Props) {
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const classes = ["card-panel", "global-card-container-shadow", fullHeight ? "h-100" : "", padding ? "card-panel-padding" : "", className ?? ""];
  return (
    <div className={classes.filter(Boolean).join(" ")} style={style} onClick={onClick}>
      {title !== undefined && (
        <div className="card-panel-title">
          <div>
            <Typography.Title level={5} style={{ marginBottom: 0 }}>
              {title}
            </Typography.Title>
          </div>
          <div>
            <Typography.Text>
              {operator}
              {isDesignMode && operatorDesign}
            </Typography.Text>
          </div>
        </div>
      )}
      <div className="card-panel-content">
        {children}
        {isDesignMode && bodyDesign}
      </div>
    </div>
  );
}
