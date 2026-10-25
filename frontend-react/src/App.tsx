/**
 * App shell (port of App.vue): theme provider, header, breadcrumbs and the
 * routed page, plus the navigation guard from config/routes.
 *
 * TODO(port, phase 1): AppSidebarMenu (sidebarPosition "left"),
 * AppBottomNav for phones, MyselfInfoDialog, UploadBubble.
 */
import { App as AntApp, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import AppHeader from "@/components/AppHeader";
import Breadcrumbs from "@/components/Breadcrumbs";
import { FLAT_ROUTES, resolveNavigation } from "@/config/routes";
import { getCurrentLang } from "@/lang/i18n";
import { useAppConfig } from "@/stores/appConfig";
import { useAppState } from "@/stores/appState";
import { useLayoutContainer } from "@/stores/layoutContainer";
import { closeAppLoading } from "@/tools/dom";
import Install from "@/views/Install";
import LayoutContainer from "@/views/LayoutContainer";
import Login from "@/views/Login";

const VIEWS = { layout: LayoutContainer, login: Login, install: Install };

/** Applies resolveNavigation() before rendering any page. */
function Guarded({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isInstall = useAppState((s) => s.isInstall);
  const user = useAppState((s) => s.userInfo);
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const redirect = resolveNavigation(location.pathname, { isInstall, user, isDesignMode });
  if (redirect && redirect !== location.pathname) return <Navigate to={redirect} replace />;
  return <>{children}</>;
}

export default function App() {
  const themeConfig = useAppConfig((s) => s.themeConfig);
  const initAppTheme = useAppConfig((s) => s.initAppTheme);
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const hasUser = useAppState((s) => Boolean(s.userInfo));
  const location = useLocation();

  useEffect(() => {
    initAppTheme();
    closeAppLoading();
  }, [initAppTheme]);

  const navStyle = hasUser ? { zIndex: isDesignMode ? 997 : 1 } : {};
  const locale = getCurrentLang() === "zh_cn" ? zhCN : enUS;

  return (
    <ConfigProvider theme={themeConfig} locale={locale} componentSize="large">
      {/* component={false}: no wrapper div, so antd does not override the copied SCSS line-heights. */}
      <AntApp component={false}>
        <div className="global-app-container">
          <main className="main-content">
            <AppHeader style={navStyle} />
            <Breadcrumbs />
            <Routes>
              {FLAT_ROUTES.map((r) => {
                const View = VIEWS[r.view];
                // key on full URL so every navigation remounts, like :key="$route.fullPath".
                return <Route key={r.path} path={r.path} element={<Guarded><View key={location.pathname + location.search} /></Guarded>} />;
              })}
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </main>
        </div>
      </AntApp>
    </ConfigProvider>
  );
}
