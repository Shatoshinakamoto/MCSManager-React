/** Clickable tile with a faint background icon (port of components/InnerCard.vue). */
import { Typography } from "antd";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import "./InnerCard.scss";

interface Props {
  icon?: ComponentType;
  title: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
}

export default function InnerCard({ icon: Icon, title, children, style, onClick }: Props) {
  return (
    <div
      className="inner-card-wrapper"
      style={style}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick?.()}
    >
      <div className="inner-card-container">
        <Typography.Text strong>{title}</Typography.Text>
        <div className="mt-10">
          <Typography.Text>{children}</Typography.Text>
          {Icon && (
            <div className="bg-icon">
              <Icon />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
