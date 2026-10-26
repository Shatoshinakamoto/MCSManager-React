/**
 * Row of label/value tags (port of components/TerminalTags.vue and the
 * TagInfo type of components/interface.ts). Upstream ships it but the
 * terminal page uses TerminalTopTags instead; kept so nothing from the Vue
 * UI is lost.
 */
import { Tag } from "antd";
import type { ComponentType } from "react";
import "./TerminalTags.scss";

export interface TagInfo {
  label: string;
  value: string | number;
  icon?: ComponentType;
  color?: "error" | "default" | "success" | "processing" | "warning";
  onClick?: () => void;
}

export default function TerminalTags({ tags, gap = "6px" }: { tags: TagInfo[]; gap?: string }) {
  return (
    <div className="TerminalTags container" style={{ gap }}>
      {tags.map(({ label, value, icon: Icon, color, onClick }) => (
        <Tag key={label} className="tag m-0" color={color} style={{ cursor: onClick ? "pointer" : "default" }} onClick={() => onClick?.()}>
          <span>{Icon && <Icon />}</span>
          <span>{label}</span>
          <span>{value}</span>
        </Tag>
      ))}
    </div>
  );
}
