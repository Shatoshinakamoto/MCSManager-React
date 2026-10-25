/** Floating phone navigation button (port of AppBottomNav.vue). */
import { CloseOutlined, MenuOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useLocation } from "react-router";
import { useHeaderMenus } from "@/hooks/useHeaderMenus";
import { isRouteActive, routeIcon } from "@/hooks/routeIcons";
import "./AppBottomNav.scss";

export default function AppBottomNav() {
  const { pathname } = useLocation();
  const { menus, handleToPage } = useHeaderMenus();
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      {expanded && <div className="fab-backdrop" onClick={() => setExpanded(false)} />}
      <div className="fab-container">
        {expanded && (
          <div className="fab-menu-panel">
            {menus.map((item) => (
              <button key={item.path} className={["fab-menu-item", isRouteActive(pathname, item.path) && "fab-menu-item--active"].filter(Boolean).join(" ")}
                onClick={() => { handleToPage(item.path); setExpanded(false); }} aria-label={item.name}>
                <span className="fab-menu-icon-wrap"><span className="fab-menu-icon">{routeIcon(item.path)}</span></span>
              </button>
            ))}
          </div>
        )}
        <button aria-label="Toggle navigation menu" className={["fab-ball", expanded && "fab-ball--expanded"].filter(Boolean).join(" ")} onClick={() => setExpanded((v) => !v)}>
          {expanded ? <CloseOutlined className="fab-ball-icon" /> : <MenuOutlined className="fab-ball-icon" />}
        </button>
      </div>
    </>
  );
}
