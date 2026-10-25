/** Quick start shortcuts to the app creation flow (port of widgets/QuickStart.vue). */
import { BuildFilled, DropboxSquareFilled, SwitcherFilled } from "@ant-design/icons";
import { Row } from "antd";
import { useNavigate } from "react-router";
import ActionButton from "@/components/ActionButton";
import CardPanel from "@/components/CardPanel";
import FadeUp from "@/components/FadeUp";
import type { WidgetProps } from "@/config/widgets";
import { t } from "@/lang/i18n";

/** Same values as upstream hooks/widgets/quickStartFlow.ts QUICKSTART_ACTION_TYPE. */
export enum QUICKSTART_ACTION_TYPE {
  Minecraft = "minecraft",
  Bedrock = "bedrock",
  Hytale = "hytale",
  Terraria = "terraria",
  SteamGameServer = "steam",
  Docker = "docker",
  AnyApp = "universal"
}

export default function QuickStart({ card }: WidgetProps) {
  const navigate = useNavigate();
  const go = (appType: QUICKSTART_ACTION_TYPE) => () => navigate(`/quickstart?appType=${appType}`);
  const actions = [
    { icon: BuildFilled, title: t("TXT_CODE_68128434"), click: go(QUICKSTART_ACTION_TYPE.Minecraft) },
    { icon: SwitcherFilled, title: t("TXT_CODE_46bb965"), click: go(QUICKSTART_ACTION_TYPE.SteamGameServer) },
    { icon: DropboxSquareFilled, title: t("TXT_CODE_2ab3e9fd"), click: go(QUICKSTART_ACTION_TYPE.AnyApp) }
  ];
  return (
    <CardPanel style={{ height: "100%" }} title={card.title}>
      <Row gutter={[0, 12]}>
        <FadeUp>
          {actions.map((a) => (
            <ActionButton key={a.title} title={a.title} click={a.click} icon={a.icon} />
          ))}
        </FadeUp>
      </Row>
    </CardPanel>
  );
}
