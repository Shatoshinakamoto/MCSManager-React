/**
 * Widget registry: maps a layout card `type` to its React component
 * (port of LAYOUT_CARD_TYPES in upstream config/index.ts).
 *
 * Every upstream type is listed in PORT_STATUS so the port's progress is
 * visible in one place. Types not yet ported render NotPortedCard, which keeps
 * the page layout intact while the widget is rebuilt.
 */
import { Typography } from "antd";
import type { ComponentType } from "react";
import CardPanel from "@/components/CardPanel";
import type { LayoutCard } from "@/types";
import LoginCard from "@/widgets/LoginCard";
import { EmptyCard, Page404, TitleCard } from "@/widgets/simple";
import { InstanceChart, RequestChart } from "@/widgets/overview/charts";
import DataOverview from "@/widgets/overview/DataOverview";
import NodeOverview from "@/widgets/overview/NodeOverview";
import StatusBlock from "@/widgets/overview/StatusBlock";
import OperationLogCard from "@/widgets/logs/OperationLogCard";
import NodeItem from "@/widgets/node/NodeItem";
import NodeList from "@/widgets/node/NodeList";
import InstanceList from "@/widgets/InstanceList";
import DefaultCard from "@/widgets/DefaultCard";
import Settings from "@/widgets/Settings";
import QuickStart from "@/widgets/QuickStart";
import UserInstanceList from "@/widgets/user/UserInstanceList";
import UserStatusBlock from "@/widgets/user/UserStatusBlock";
import { InstanceShortcutWidget } from "@/widgets/instance/Shortcut";

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
  UserInstanceList,
  UserStatusBlock,
  QuickStart,
  DefaultCard,
  Settings
};

/** Upstream widget types and the phase each is planned for. */
export const PORT_STATUS: Record<string, "done" | 1 | 2 | 3 | 4> = {
  LoginCard: "done", Page404: "done", TitleCard: "done", EmptyCard: "done",
  DataOverview: "done", StatusBlock: "done", UserStatusBlock: "done", NodeOverview: "done", RequestChart: "done", InstanceChart: "done",
  InstanceList: "done", UserInstanceList: "done", NodeList: "done", NodeItem: "done", QuickStart: "done", DefaultCard: "done",
  Terminal: 2, InstanceManagerBtns: 2, InstanceBaseInfo: 2, InstanceFileManager: 2, Schedule: 2,
  InstanceServerConfigOverview: 2, InstanceServerConfigFile: 2, InstanceShortcut: "done", InstanceModManager: 2,
  Settings: "done", UserList: 3, UserAccessSettings: 3, ImageManager: 3, NewImage: 3, AuditLog: 3, OperationLogCard: "done",
  QuickStartFlow: 3, McPreset: 3, Market: 3, MarketEditor: 3,
  ImageBox: 4, IframeCard: 4, TextCard: 4, LinkCard: 4, ClockCard: 4, Carousel: 4, PluginCard: 4, MusicCard: 4
};
