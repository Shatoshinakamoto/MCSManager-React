/**
 * Main-menu routes and right-side app actions (port of hooks/useHeaderMenus.ts).
 * Same filtering rules: design mode shows edit-only pages; admins see main
 * menu pages; users see main-menu pages at or below their permission.
 */
import {
  AppstoreAddOutlined, BgColorsOutlined, BuildOutlined, CloseCircleOutlined,
  GithubFilled, LogoutOutlined, RedoOutlined, SaveOutlined, UserOutlined
} from "@ant-design/icons";
import { App } from "antd";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { FLAT_ROUTES } from "@/config/routes";
import { t } from "@/lang/i18n";
import { logoutUser } from "@/services/apis";
import { useAppConfig } from "@/stores/appConfig";
import { useAppTools } from "@/stores/appTools";
import { isAdminUser, isLoggedIn, useAppState } from "@/stores/appState";
import { useLayoutConfig } from "@/stores/layoutConfig";
import { useLayoutContainer } from "@/stores/layoutContainer";
import { AppTheme } from "@/types";

export interface MenuRoute {
  path: string;
  name: string;
  customClass: string[];
}

export interface AppMenu {
  title: string;
  /** Longer label used in the sidebar. */
  leftSideTitle?: string;
  icon: ReactNode;
  click: (key?: string) => void;
  conditions: boolean;
  onlyPC?: boolean;
  onlyHeader?: boolean;
  customClass?: string[];
  menus?: { value: string | number; title: string }[];
}

export type SidebarEntry =
  | { type: "divider" }
  | ({ type: "route" } & MenuRoute)
  | ({ type: "app" } & AppMenu);

export function useHeaderMenus() {
  const navigate = useNavigate();
  const { modal, notification, message } = App.useApp();
  const user = useAppState((s) => s.userInfo);
  const { isDesignMode, setDesignMode, setShowPhoneMenu, setShowNewCardDialog } = useLayoutContainer();
  const setTheme = useAppConfig((s) => s.setTheme);
  const setShowUserInfoDialog = useAppTools((s) => s.setShowUserInfoDialog);
  const { save, reset } = useLayoutConfig();
  const isAdmin = isAdminUser(user);
  const isLogged = isLoggedIn(user);

  const handleToPage = (path: string) => {
    setShowPhoneMenu(false);
    navigate(path);
  };

  const menus: MenuRoute[] = FLAT_ROUTES.filter((r) => {
    if (r.path === "/" || !r.nameKey) return false;
    if (isDesignMode) return Boolean(r.meta.onlyDisplayEditMode || r.meta.mainMenu);
    if (isAdmin) return r.meta.mainMenu === true && r.meta.onlyDisplayEditMode !== true;
    return r.meta.mainMenu === true && isLogged && Number(user?.permission) >= Number(r.meta.permission);
  }).map((r) => ({ path: r.path, name: t(r.nameKey), customClass: r.meta.customClass ?? [] }));

  const reloadSoon = (ms: number) => setTimeout(() => window.location.reload(), ms);

  const appMenus: AppMenu[] = [
    {
      // Hidden like upstream (its conditions flag is unset there), kept for parity.
      title: "GitHub", icon: <GithubFilled />, onlyPC: true, onlyHeader: true, conditions: false,
      // SECURITY: noopener prevents the new tab from controlling this one.
      click: () => window.open("https://github.com/MCSManager/MCSManager", "_blank", "noopener,noreferrer")
    },
    { title: t("TXT_CODE_8b0f8aab"), icon: <AppstoreAddOutlined />, click: () => setShowNewCardDialog(true), conditions: isDesignMode, onlyPC: true },
    {
      title: t("TXT_CODE_8145d82"), icon: <SaveOutlined />, conditions: isDesignMode, onlyPC: true, customClass: ["nav-button-success"],
      click: () =>
        modal.confirm({
          title: t("TXT_CODE_d73c8510"), content: t("TXT_CODE_6d9b9f22"),
          async onOk() {
            setDesignMode(false);
            await save();
            notification.success({ placement: "top", message: t("TXT_CODE_47c35915"), description: t("TXT_CODE_e10c992a") });
            reloadSoon(400);
          }
        })
    },
    {
      title: t("TXT_CODE_5b5d6f04"), icon: <CloseCircleOutlined />, conditions: isDesignMode, onlyPC: true, customClass: ["nav-button-warning"],
      click: () => modal.confirm({ title: t("TXT_CODE_8f20c21c"), content: t("TXT_CODE_9740f199"), onOk: () => window.location.reload() })
    },
    {
      title: t("TXT_CODE_abd2f7e1"), icon: <RedoOutlined />, conditions: isDesignMode, onlyPC: true, customClass: ["nav-button-danger"],
      click: () =>
        modal.confirm({
          title: t("TXT_CODE_74fa2f73"), content: t("TXT_CODE_f63bfe78"),
          async onOk() {
            await reset();
            notification.success({ placement: "top", message: t("TXT_CODE_15c6d4eb"), description: t("TXT_CODE_e10c992a") });
            reloadSoon(400);
          }
        })
    },
    {
      title: t("TXT_CODE_5d88a9b"), leftSideTitle: t("TXT_CODE_ee01c10c"), icon: <BgColorsOutlined />, conditions: !isDesignMode,
      click: (key) => setTheme(Number(key) as AppTheme),
      menus: [
        { value: AppTheme.AUTO, title: t("TXT_CODE_dc8de4ff") },
        { value: AppTheme.LIGHT, title: t("TXT_CODE_673eac8e") },
        { value: AppTheme.DARK, title: t("TXT_CODE_5e4a370d") }
      ]
    },
    {
      title: t("TXT_CODE_ebd2a6a1"), leftSideTitle: t("TXT_CODE_4eb158da"), icon: <BuildOutlined />, conditions: !isDesignMode && isAdmin, onlyPC: true,
      click: () =>
        modal.confirm({
          title: t("TXT_CODE_29e85f34"), content: t("TXT_CODE_f18f65db"),
          onOk() {
            setDesignMode(true);
            notification.warning({ placement: "bottom", message: t("TXT_CODE_7b1adf35"), description: t("TXT_CODE_6b6f1d3") });
          }
        })
    },
    {
      title: t("TXT_CODE_8c3164c9"), icon: <UserOutlined />, conditions: !isDesignMode && isLogged,
      click: () => setShowUserInfoDialog(true)
    },
    {
      title: t("TXT_CODE_2c69ab15"), icon: <LogoutOutlined />, conditions: !isDesignMode && isLogged, customClass: ["nav-button-danger"],
      click: () =>
        modal.confirm({
          title: t("TXT_CODE_9654b91c"),
          async onOk() {
            await logoutUser();
            message.success(t("TXT_CODE_11673d8c"));
            setTimeout(() => (window.location.href = "/"), 400);
          }
        })
    }
  ];

  /** Sidebar: route links, a divider, then app actions (header-only items excluded). */
  const sidebarItems: SidebarEntry[] = [
    ...menus.map((r) => ({ type: "route" as const, ...r })),
    { type: "divider" as const },
    ...appMenus.filter((m) => m.conditions && !m.onlyHeader).map((m) => ({ type: "app" as const, ...m, title: m.leftSideTitle || m.title }))
  ];

  return { menus, appMenus, sidebarItems, handleToPage };
}
