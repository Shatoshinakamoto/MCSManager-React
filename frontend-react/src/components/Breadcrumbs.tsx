/** Breadcrumb trail built from the route tree (port of Breadcrumbs.vue). */
import { Breadcrumb } from "antd";
import { useLocation } from "react-router";
import { findRoute } from "@/config/routes";
import { t } from "@/lang/i18n";
import { useAppState } from "@/stores/appState";

export default function Breadcrumbs() {
  const { pathname, search } = useLocation();
  const permission = useAppState((s) => s.userInfo?.permission ?? 0);
  const route = findRoute(pathname);
  if (!route) return null;
  // Child pages carry ?instanceId=&daemonId=; keep them on non-menu ancestors.
  const query = search.replace(/^\?/, "");
  const items = [
    { title: <a href=".">{t("TXT_CODE_f5b9d58f")}</a> },
    ...route.parents
      .filter((p) => permission >= p.meta.permission)
      .map((p) => ({
        title: <a href={`./#${p.path}${query && !p.meta.mainMenu ? `?${query}` : ""}`}>{t(p.nameKey)}</a>
      })),
    { title: <span>{route.nameKey ? t(route.nameKey) : ""}</span> }
  ];
  return (
    <div className="breadcrumbs" style={{ fontSize: 18, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0" }}>
      <Breadcrumb items={items} />
    </div>
  );
}
