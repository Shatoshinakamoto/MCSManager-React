/**
 * Widget registry: maps a layout card `type` to its React component
 * (port of LAYOUT_CARD_TYPES in upstream config/index.ts).
 *
 * Every upstream type is listed in PORT_STATUS so the port's progress is
 * visible in one place. Types not yet ported render NotPortedCard, which keeps
 * the page layout intact while the widget is rebuilt.
 */
import { Typography } from "antd";
import { lazy, type ComponentType } from "react";
import CardPanel from "@/components/CardPanel";
import type { LayoutCard } from "@/types";
import LoginCard from "@/widgets/LoginCard";
import { EmptyCard, Page404, TitleCard } from "@/widgets/simple";

// Widgets load on demand (one chunk each, plus shared vendor chunks) so the
// first page does not download the terminal, editor, charts and market code.
// LayoutCard wraps them in <Suspense>. The map below stays static, so only
// these known modules can ever load (CWE-20, no import by card name).
const InstanceChart = lazy(() => import("@/widgets/overview/charts").then((m) => ({ default: m.InstanceChart })));
const RequestChart = lazy(() => import("@/widgets/overview/charts").then((m) => ({ default: m.RequestChart })));
const DataOverview = lazy(() => import("@/widgets/overview/DataOverview"));
const NodeOverview = lazy(() => import("@/widgets/overview/NodeOverview"));
const StatusBlock = lazy(() => import("@/widgets/overview/StatusBlock"));
const OperationLogCard = lazy(() => import("@/widgets/logs/OperationLogCard"));
const NodeItem = lazy(() => import("@/widgets/node/NodeItem"));
const NodeList = lazy(() => import("@/widgets/node/NodeList"));
const InstanceList = lazy(() => import("@/widgets/InstanceList"));
const DefaultCard = lazy(() => import("@/widgets/DefaultCard"));
const Settings = lazy(() => import("@/widgets/Settings"));
const QuickStart = lazy(() => import("@/widgets/QuickStart"));
const UserInstanceList = lazy(() => import("@/widgets/user/UserInstanceList"));
const UserStatusBlock = lazy(() => import("@/widgets/user/UserStatusBlock"));
const InstanceShortcutWidget = lazy(() => import("@/widgets/instance/Shortcut").then((m) => ({ default: m.InstanceShortcutWidget })));
const Terminal = lazy(() => import("@/widgets/instance/Terminal"));
const BaseInfo = lazy(() => import("@/widgets/instance/BaseInfo"));
const ManagerBtns = lazy(() => import("@/widgets/instance/ManagerBtns"));
const FileManager = lazy(() => import("@/widgets/instance/FileManager"));
const ModManager = lazy(() => import("@/widgets/instance/ModManager"));
const Schedule = lazy(() => import("@/widgets/instance/Schedule"));
const ServerConfigFile = lazy(() => import("@/widgets/instance/ServerConfigFile"));
const ServerConfigOverview = lazy(() => import("@/widgets/instance/ServerConfigOverview"));
const UserList = lazy(() => import("@/widgets/UserList"));
const AuditLog = lazy(() => import("@/widgets/AuditLog"));
const ImageManager = lazy(() => import("@/widgets/imageManager/ImageManager"));
const NewImage = lazy(() => import("@/widgets/imageManager/NewImage"));
const AccessSettings = lazy(() => import("@/widgets/user/AccessSettings"));
const QuickStartFlow = lazy(() => import("@/widgets/setupApp/QuickStartFlow"));
const McPreset = lazy(() => import("@/widgets/setupApp/McPreset"));
const Market = lazy(() => import("@/widgets/market/Market"));
const MarketEditor = lazy(() => import("@/widgets/market/MarketEditor"));
const ImageBox = lazy(() => import("@/widgets/others/ImageBox"));
const Carousel = lazy(() => import("@/widgets/others/Carousel"));
const IframeCard = lazy(() => import("@/widgets/others/IframeCard"));
const TextCard = lazy(() => import("@/widgets/others/TextCard"));
const LinkCard = lazy(() => import("@/widgets/others/LinkCard"));
const ClockCard = lazy(() => import("@/widgets/others/ClockCard"));
const MusicCard = lazy(() => import("@/widgets/others/MusicCard"));
const PluginCard = lazy(() => import("@/widgets/others/PluginCard"));

export type WidgetProps = { card: LayoutCard };

export function NotPortedCard({ card }: WidgetProps) {
  return (
    <CardPanel title={card.title}>
      <Typography.Paragraph type="secondary">
        "{card.type}" has not been ported to React yet.
      </Typography.Paragraph>
    </CardPanel>
  );
}

export const LAYOUT_CARD_TYPES: Record<string, ComponentType<WidgetProps>> = {
  LoginCard,
  Page404,
  TitleCard,
  EmptyCard,
  StatusBlock,
  DataOverview,
  NodeOverview,
  RequestChart,
  InstanceChart,
  OperationLogCard,
  NodeList,
  NodeItem: ({ card }: WidgetProps) => <NodeItem card={card} />,
  InstanceList,
  InstanceShortcut: InstanceShortcutWidget,
  Terminal,
  InstanceBaseInfo: BaseInfo,
  InstanceManagerBtns: ManagerBtns,
  InstanceFileManager: FileManager,
  Schedule,
  InstanceServerConfigOverview: ServerConfigOverview,
  InstanceServerConfigFile: ServerConfigFile,
  InstanceModManager: ModManager,
  UserList,
  UserAccessSettings: AccessSettings,
  AuditLog,
  ImageManager,
  NewImage,
  UserInstanceList,
  UserStatusBlock,
  QuickStart,
  DefaultCard,
  Settings,
  QuickStartFlow,
  McPreset,
  Market,
  MarketEditor,
  ImageBox,
  Carousel,
  IframeCard,
  TextCard,
  LinkCard,
  ClockCard,
  MusicCard,
  PluginCard
};

/** Upstream widget types and the phase each is planned for. */
export const PORT_STATUS: Record<string, "done" | 1 | 2 | 3 | 4> = {
  LoginCard: "done", Page404: "done", TitleCard: "done", EmptyCard: "done",
  DataOverview: "done", StatusBlock: "done", UserStatusBlock: "done", NodeOverview: "done", RequestChart: "done", InstanceChart: "done",
  InstanceList: "done", UserInstanceList: "done", NodeList: "done", NodeItem: "done", QuickStart: "done", DefaultCard: "done",
  Terminal: "done", InstanceManagerBtns: "done", InstanceBaseInfo: "done", InstanceFileManager: "done", Schedule: "done",
  InstanceServerConfigOverview: "done", InstanceServerConfigFile: "done", InstanceShortcut: "done", InstanceModManager: "done",
  Settings: "done", UserList: "done", UserAccessSettings: "done", ImageManager: "done", NewImage: "done", AuditLog: "done", OperationLogCard: "done",
  QuickStartFlow: "done", McPreset: "done", Market: "done", MarketEditor: "done",
  ImageBox: "done", IframeCard: "done", TextCard: "done", LinkCard: "done", ClockCard: "done", Carousel: "done", PluginCard: "done", MusicCard: "done"
};
