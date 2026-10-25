/** Left sidebar navigation used when the layout sets sidebarPosition "left" (port of AppSidebarMenu.vue). */
import { Dropdown } from "antd";
import { useLocation } from "react-router";
import { useHeaderMenus } from "@/hooks/useHeaderMenus";
import { isRouteActive, routeIcon } from "@/hooks/routeIcons";
import { useAppConfig } from "@/stores/appConfig";
import "./AppSidebarMenu.scss";

const cls = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export default function AppSidebarMenu({ style }: { style?: React.CSSProperties }) {
  const { pathname } = useLocation();
  const { sidebarItems, handleToPage } = useHeaderMenus();
  const logoImage = useAppConfig((s) => s.logoImage);

  return (
    <aside className="left-sidebar" style={style}>
      <a href="." className="logo">
        <img src={logoImage} alt="MCSManager" />
      </a>
      <nav className="sidebar-menu">
        {sidebarItems.map((entry, index) => {
          if (entry.type === "divider") return <div key="divider" className="sidebar-divider" />;
          if (entry.type === "route") {
            return (
              <a key={entry.path} href={`#${entry.path}`} className={cls("sidebar-item", ...entry.customClass, isRouteActive(pathname, entry.path) && "sidebar-item-active")}
                onClick={(e) => { e.preventDefault(); handleToPage(entry.path); }}>
                <span className="sidebar-item-icon">{routeIcon(entry.path)}</span>
                <span className="sidebar-item-text">{entry.name}</span>
              </a>
            );
          }
          const body = (
            <a className={cls("sidebar-item", ...(entry.customClass ?? []))} onClick={(e) => { e.preventDefault(); if (!entry.menus) entry.click(); }}>
              <span className="sidebar-item-icon">{entry.icon}</span>
              <span className="sidebar-item-text">{entry.title}</span>
            </a>
          );
          return entry.menus ? (
            <Dropdown key={`app-${index}`} trigger={["click"]} placement="topRight" menu={{ items: entry.menus.map((m) => ({ key: String(m.value), label: m.title })), onClick: (i) => entry.click(i.key) }}>
              {body}
            </Dropdown>
          ) : (
            <span key={`app-${index}`} style={{ width: "100%" }}>{body}</span>
          );
        })}
      </nav>
    </aside>
  );
}
