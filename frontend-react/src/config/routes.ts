/**
 * Route table and navigation guard, ported from upstream config/router.ts.
 *
 * Paths, permissions, menu flags and breadcrumbs match the Vue app so layouts
 * keyed by path keep working. Names are i18n keys resolved at render time.
 *
 * Security: the guard only hides pages the user cannot use. Authorisation is
 * enforced by the panel on every API call (deny by default, ASVS V4.1.1,
 * NIST AC-3); a user who bypasses this guard sees empty cards, not data.
 */
import { ROLE, type LoginUserInfo } from "@/types";

export interface RouteMeta {
  permission: ROLE;
  mainMenu?: boolean;
  onlyDisplayEditMode?: boolean;
  customClass?: string[];
  redirect?: (user: LoginUserInfo | null) => string;
  /** Needs the Web Admin role once enforcement is on (panel routes at ROLE.WEBADMIN). */
  webAdmin?: boolean;
}

export interface AppRoute {
  path: string;
  /** i18n key, or "" for the root. */
  nameKey: string;
  view: "layout" | "login" | "install" | "ssoBind";
  meta: RouteMeta;
  children?: AppRoute[];
}

export const ROUTES: AppRoute[] = [
  { path: "/install", nameKey: "TXT_CODE_82d650be", view: "install", meta: { permission: ROLE.GUEST } },
  {
    path: "/quickstart", nameKey: "TXT_CODE_2799a1dd", view: "layout", meta: { permission: ROLE.ADMIN },
    children: [{ path: "/quickstart/minecraft", nameKey: "TXT_CODE_88249aee", view: "layout", meta: { permission: ROLE.ADMIN } }]
  },
  {
    path: "/", nameKey: "", view: "layout",
    meta: {
      mainMenu: true,
      permission: ROLE.USER,
      redirect: (user) => {
        if (Number(user?.permission) >= ROLE.ADMIN) return "/instances";
        if (user?.permission && user.permission >= ROLE.USER) return "/customer";
        return "/login";
      }
    }
  },
  {
    path: "/instances", nameKey: "TXT_CODE_e21473bc", view: "layout", meta: { mainMenu: true, permission: ROLE.ADMIN },
    children: [
      {
        path: "/instances/terminal", nameKey: "TXT_CODE_524e3036", view: "layout", meta: { permission: ROLE.USER },
        children: [
          { path: "/instances/terminal/files", nameKey: "TXT_CODE_ae533703", view: "layout", meta: { permission: ROLE.USER } },
          { path: "/instances/terminal/mods", nameKey: "TXT_CODE_MOD_MANAGER", view: "layout", meta: { permission: ROLE.USER } },
          {
            path: "/instances/terminal/serverConfig", nameKey: "TXT_CODE_d07742fe", view: "layout", meta: { permission: ROLE.USER },
            children: [
              { path: "/instances/terminal/serverConfig/fileEdit", nameKey: "TXT_CODE_78019c60", view: "layout", meta: { permission: ROLE.USER } }
            ]
          },
          { path: "/instances/schedule", nameKey: "TXT_CODE_b7d026f8", view: "layout", meta: { permission: ROLE.USER } }
        ]
      }
    ]
  },
  {
    path: "/market", nameKey: "TXT_CODE_27594db8", view: "layout", meta: { mainMenu: true, permission: ROLE.ADMIN },
    children: [{ path: "/market/editor", nameKey: "TXT_CODE_54275b9c", view: "layout", meta: { permission: ROLE.ADMIN } }]
  },
  { path: "/overview", nameKey: "TXT_CODE_84fbe277", view: "layout", meta: { mainMenu: true, permission: ROLE.ADMIN } },
  {
    path: "/users", nameKey: "TXT_CODE_1deaa2dd", view: "layout", meta: { mainMenu: true, permission: ROLE.ADMIN, webAdmin: true },
    children: [{ path: "/users/resources", nameKey: "TXT_CODE_236f70aa", view: "layout", meta: { permission: ROLE.ADMIN, webAdmin: true } }]
  },
  {
    path: "/node", nameKey: "TXT_CODE_e076d90b", view: "layout", meta: { mainMenu: true, permission: ROLE.ADMIN },
    children: [
      {
        path: "/node/image", nameKey: "TXT_CODE_e6c30866", view: "layout", meta: { permission: ROLE.ADMIN, webAdmin: true },
        children: [{ path: "/node/image/new", nameKey: "TXT_CODE_3d09f0ac", view: "layout", meta: { permission: ROLE.ADMIN, webAdmin: true } }]
      }
    ]
  },
  { path: "/audit", nameKey: "TXT_CODE_ea1600d2", view: "layout", meta: { permission: ROLE.ADMIN } },
  { path: "/settings", nameKey: "TXT_CODE_b5c7b82d", view: "layout", meta: { permission: ROLE.ADMIN, mainMenu: true, webAdmin: true, customClass: ["nav-button-success"] } },
  { path: "/user", nameKey: "TXT_CODE_8c3164c9", view: "layout", meta: { permission: ROLE.ADMIN } },
  { path: "/404", nameKey: "TXT_CODE_393c816c", view: "layout", meta: { permission: ROLE.GUEST } },
  { path: "/customer", nameKey: "TXT_CODE_ec299306", view: "layout", meta: { permission: ROLE.USER, mainMenu: true, onlyDisplayEditMode: true } },
  { path: "/login", nameKey: "TXT_CODE_24873a8a", view: "login", meta: { permission: ROLE.GUEST, onlyDisplayEditMode: true, customClass: ["nav-button-warning"] } },
  { path: "/_open_page", nameKey: "TXT_CODE_2cf59872", view: "layout", meta: { permission: ROLE.ADMIN, mainMenu: true, onlyDisplayEditMode: true, customClass: ["nav-button-warning"] } },
  { path: "/sso/bind", nameKey: "TXT_CODE_SSO_BIND_TITLE", view: "ssoBind", meta: { permission: ROLE.GUEST } }
];

export interface FlatRoute extends AppRoute {
  /** Ancestors, for breadcrumbs. */
  parents: AppRoute[];
}

/** Flatten the tree once; breadcrumbs come from the parent chain. */
export function flattenRoutes(routes: AppRoute[] = ROUTES, parents: AppRoute[] = []): FlatRoute[] {
  return routes.flatMap((r) => [{ ...r, parents }, ...flattenRoutes(r.children ?? [], [...parents, r])]);
}
export const FLAT_ROUTES = flattenRoutes();

export function findRoute(path: string): FlatRoute | undefined {
  return FLAT_ROUTES.find((r) => r.path === path);
}

export interface GuardState {
  isInstall: boolean;
  user: LoginUserInfo | null;
  isDesignMode: boolean;
  /** Effective Web Admin enforcement from /api/auth/status. */
  webAdminEnforced?: boolean;
}

/** True when the route is a Web Admin page and this user cannot use it right now. */
export function isWebAdminLocked(route: AppRoute | undefined, user: LoginUserInfo | null, enforced?: boolean): boolean {
  return !!route?.meta.webAdmin && !!enforced && Number(user?.permission) < ROLE.WEBADMIN;
}

/**
 * Decide where a navigation should end up. Same rules and order as upstream
 * router.beforeEach.
 * @returns a redirect path, or null to allow the navigation
 */
export function resolveNavigation(toPath: string, s: GuardState): string | null {
  const path = toPath.trim();
  const route = findRoute(path);
  const userPermission = s.user?.permission ?? 0;
  const isAdmin = userPermission >= ROLE.ADMIN;

  if (!s.isInstall && path !== "/install") return "/install";
  if (route?.meta.redirect) return route.meta.redirect(s.user);

  if (path === "/login" && s.user?.token) {
    if (isAdmin) return s.isDesignMode ? null : "/";
    return "/customer";
  }
  if (path.includes("_open_page") || path.startsWith("/sso/") || ["/login", "/install", "/404"].includes(path)) {
    return null;
  }
  if (!route) return "/404";
  if (!s.user?.token) return "/login";

  if (isWebAdminLocked(route, s.user, s.webAdminEnforced)) return "/404";
  const pagePermission = route.meta.permission;
  if (pagePermission > userPermission && !isAdmin) return "/customer";
  return pagePermission <= userPermission || isAdmin ? null : "/404";
}
