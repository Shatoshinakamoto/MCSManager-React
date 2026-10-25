/** Route icons shared by the sidebar and phone bottom nav (same map as upstream). */
import {
  ApartmentOutlined, AppstoreOutlined, AreaChartOutlined, LinkOutlined, LoginOutlined,
  MenuOutlined, SettingOutlined, ShopOutlined, TeamOutlined, UserOutlined
} from "@ant-design/icons";
import type { ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
  "/instances": <AppstoreOutlined />,
  "/market": <ShopOutlined />,
  "/overview": <AreaChartOutlined />,
  "/users": <TeamOutlined />,
  "/node": <ApartmentOutlined />,
  "/settings": <SettingOutlined />,
  "/customer": <UserOutlined />,
  "/login": <LoginOutlined />,
  "/_open_page": <LinkOutlined />
};

export function routeIcon(path: string): ReactNode {
  return ICONS[path] ?? <MenuOutlined />;
}

/** Active when the current path equals `path` or is below it. */
export function isRouteActive(current: string, path: string): boolean {
  if (current === path) return true;
  if (path === "/") return false;
  return current.startsWith(path + "/");
}
