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
  EmptyCard
};

/** Upstream widget types and the phase each is planned for. */
export const PORT_STATUS: Record<string, "done" | 1 | 2 | 3 | 4> = {
  LoginCard: "done", Page404: "done", TitleCard: "done", EmptyCard: "done",
  DataOverview: 1, StatusBlock: 1, UserStatusBlock: 1, NodeOverview: 1, RequestChart: 1, InstanceChart: 1,
  InstanceList: 1, UserInstanceList: 1, NodeList: 1, NodeItem: 1, QuickStart: 1, DefaultCard: 1,
  Terminal: 2, InstanceManagerBtns: 2, InstanceBaseInfo: 2, InstanceFileManager: 2, Schedule: 2,
  InstanceServerConfigOverview: 2, InstanceServerConfigFile: 2, InstanceShortcut: 2, InstanceModManager: 2,
  Settings: 3, UserList: 3, UserAccessSettings: 3, ImageManager: 3, NewImage: 3, AuditLog: 3, OperationLogCard: 3,
  QuickStartFlow: 3, McPreset: 3, Market: 3, MarketEditor: 3,
  ImageBox: 4, IframeCard: 4, TextCard: 4, LinkCard: 4, ClockCard: 4, Carousel: 4, PluginCard: 4, MusicCard: 4
};
