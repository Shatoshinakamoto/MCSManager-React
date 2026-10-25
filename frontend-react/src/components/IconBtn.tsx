/** Port of IconBtn.vue: icon button with tooltip, optional warning colour. */
import { Tooltip } from "antd";
import type { TooltipPlacement } from "antd/es/tooltip";
import type { ComponentType } from "react";
import "./IconBtn.scss";

interface Props {
  icon: ComponentType;
  title: string;
  placement?: TooltipPlacement;
  warning?: boolean;
  tooltip?: string;
  onClick?: () => void;
}

export default function IconBtn({ icon: Icon, title, placement = "top", warning, tooltip, onClick }: Props) {
  return (
    <Tooltip placement={placement} title={<span style={tooltip ? { whiteSpace: "pre-wrap" } : undefined}>{tooltip || title}</span>}>
      <span
        className={["icon-btn", warning ? "color-warning" : ""].filter(Boolean).join(" ")}
        role="button"
        tabIndex={0}
        aria-label={title}
        onClick={onClick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick?.()}
      >
        <Icon />
      </span>
    </Tooltip>
  );
}
