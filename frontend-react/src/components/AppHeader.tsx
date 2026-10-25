/** Top navigation bar for desktop and the compact phone header (port of AppHeader.vue). */
import { MenuUnfoldOutlined } from "@ant-design/icons";
import { Button, Drawer, Dropdown, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import logo from "@/assets/logo.png";
import { useHeaderMenus } from "@/hooks/useHeaderMenus";
import { useScreen } from "@/hooks/useScreen";
import { useAppConfig } from "@/stores/appConfig";
import { useLayoutContainer } from "@/stores/layoutContainer";
import CardPanel from "./CardPanel";
import "./AppHeader.scss";

export default function AppHeader({ style }: { style?: React.CSSProperties }) {
  const { pathname } = useLocation();
  const logoImage = useAppConfig((s) => s.logoImage);
  const { showPhoneMenu, setShowPhoneMenu } = useLayoutContainer();
  const { menus, appMenus, handleToPage } = useHeaderMenus();
  const { isPhone } = useScreen();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (path: string) => pathname === path || (path !== "/" && pathname.startsWith(path + "/"));
  const cls = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

  return (
    <>
      {!isPhone && (
        <>
          <header className="app-header-wrapper" style={{ ...style, ["--header-height" as string]: scrolled ? "60px" : "64px" }}>
            <div className="app-header-content">
              <nav className="btns">
                <a href="." style={{ marginRight: 12 }}>
                  <div className="logo">
                    <img src={logoImage} style={{ height: 18 }} alt="MCSManager" />
                  </div>
                </a>
                {menus.map((item) => (
                  <div key={item.path} className={cls("nav-button", ...item.customClass, isActive(item.path) && "nav-button-active")} onClick={() => handleToPage(item.path)}>
                    <span>{item.name}</span>
                  </div>
                ))}
              </nav>
              <div className="btns">
                {appMenus.filter((m) => m.conditions).map((item) =>
                  item.menus ? (
                    <Dropdown key={item.title} placement="bottom" menu={{ items: item.menus.map((m) => ({ key: String(m.value), label: m.title })), onClick: (e) => item.click(e.key) }}>
                      <div className={cls("nav-button right-nav-button flex-center", ...(item.customClass ?? []))}>{item.icon}</div>
                    </Dropdown>
                  ) : (
                    <Tooltip key={item.title} placement="bottom" title={item.title}>
                      <div className={cls("nav-button right-nav-button flex-center", ...(item.customClass ?? []))} onClick={() => item.click()}>
                        {item.icon}
                      </div>
                    </Tooltip>
                  )
                )}
              </div>
            </div>
          </header>
          <div style={{ height: 64 }} />
        </>
      )}

      {isPhone && (
        <header className="app-header-content-for-phone">
          <CardPanel className="card-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ width: 100 }} className="flex">
                <Button type="text" icon={<MenuUnfoldOutlined />} size="small" onClick={() => setShowPhoneMenu(true)} />
                {appMenus.filter((m) => m.menus && m.conditions && !m.onlyPC).map((item) => (
                  <Dropdown key={item.title} placement="bottom" menu={{ items: item.menus!.map((m) => ({ key: String(m.value), label: m.title })), onClick: (e) => item.click(e.key) }}>
                    <Button className="phone-nav-button" type="text" icon={item.icon} size="small" />
                  </Dropdown>
                ))}
              </div>
              <div>
                <img src={logo} style={{ height: 18 }} alt="MCSManager" />
              </div>
              <div style={{ width: 100 }} className="justify-end">
                {appMenus.filter((m) => m.conditions && !m.onlyPC && !m.menus).map((item) => (
                  <Button key={item.title} className="phone-nav-button" type="text" icon={item.icon} size="small" onClick={() => item.click()} />
                ))}
              </div>
            </div>
          </CardPanel>
        </header>
      )}

      <Drawer size={500} title="MENU" placement="top" open={showPhoneMenu} onClose={() => setShowPhoneMenu(false)}>
        <div className="phone-menu">
          {menus.map((item) => (
            <div key={item.path} className={cls("phone-menu-btn", isActive(item.path) && "phone-menu-btn-active")} onClick={() => handleToPage(item.path)}>
              {item.name}
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}
