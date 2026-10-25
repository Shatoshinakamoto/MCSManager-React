/**
 * Left menu with one content pane per key (port of LeftMenusPanel.vue and
 * LeftMenuBtn.vue). On phones it becomes tabs, like upstream.
 */
import { Tabs, Typography } from "antd";
import { useState, type ComponentType, type ReactNode } from "react";
import { useScreen } from "@/hooks/useScreen";
import "./LeftMenusPanel.scss";

export interface LeftMenuItem {
  title: string;
  key: string;
  icon?: ComponentType;
  /** When set, clicking runs this instead of switching panes. */
  click?: () => void;
}

interface Props {
  menus: LeftMenuItem[];
  panes: Record<string, ReactNode>;
  activeKey?: string;
  onChange?: (key: string) => void;
}

function LeftMenuBtn({ title, icon: Icon, isActive }: { title: string; icon?: ComponentType; isActive: boolean }) {
  return (
    <div className={["btn", isActive && "isActive"].filter(Boolean).join(" ")}>
      {Icon && <Icon />}
      <Typography.Text className="text ml-6">{title}</Typography.Text>
    </div>
  );
}

export default function LeftMenusPanel({ menus, panes, activeKey: controlled, onChange }: Props) {
  const { isPhone } = useScreen();
  const [inner, setInner] = useState(menus[0]?.key);
  const activeKey = controlled ?? inner;
  const select = (item: LeftMenuItem) => {
    if (item.click) return item.click();
    setInner(item.key);
    onChange?.(item.key);
  };

  if (isPhone) {
    return (
      <div className="LeftMenusPanel ml-16 mr-16 mt-8 mb-8">
        <Tabs
          activeKey={activeKey}
          onChange={(k) => {
            const item = menus.find((m) => m.key === k);
            if (item) select(item);
          }}
          items={menus.map((m) => ({ key: m.key, label: m.title, children: <div style={{ textAlign: "left" }}>{panes[m.key]}</div> }))}
        />
      </div>
    );
  }

  return (
    <div className="LeftMenusPanel menu-body">
      <div className="left-menu">
        {menus.map((item) => (
          <div
            key={item.key}
            className="mb-6"
            role="button"
            tabIndex={0}
            onClick={() => select(item)}
            onKeyDown={(e) => e.key === "Enter" && select(item)}
          >
            <LeftMenuBtn title={item.title} icon={item.icon} isActive={activeKey === item.key} />
          </div>
        ))}
      </div>
      <div className="right-content" style={{ textAlign: "left" }}>
        {activeKey ? panes[activeKey] : null}
      </div>
    </div>
  );
}
