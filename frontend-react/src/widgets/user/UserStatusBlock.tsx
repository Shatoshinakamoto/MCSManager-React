/** One instance count for the signed-in user, chosen by card.meta.type (port of widgets/UserStatusBlock.vue). */
import { Typography } from "antd";
import { useMemo } from "react";
import CardPanel from "@/components/CardPanel";
import type { WidgetProps } from "@/config/widgets";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useUserInstances } from "@/hooks/useUserInstances";
import { t } from "@/lang/i18n";
import "./UserStatusBlock.scss";

export default function UserStatusBlock({ card }: WidgetProps) {
  const state = useUserInstances();
  const { getMetaValue } = useLayoutCardTools(card);
  const type = getMetaValue<string>("type");

  const realStatus = useMemo(() => {
    if (!state) return undefined;
    const list = state.instances;
    return [
      { type: "instance_all", title: t("TXT_CODE_53745cc0"), value: list.length },
      { type: "instance_running", title: t("TXT_CODE_7638590c"), value: list.filter((e) => e.status == 3).length },
      { type: "instance_stop", title: t("TXT_CODE_9bc7f49e"), value: list.filter((e) => e.status == 0).length },
      { type: "instance_error", title: t("TXT_CODE_ecf17071"), value: list.filter((e) => e.status == -1 || e.status == 1 || e.status == 2).length }
    ].find((v) => v.type === type);
  }, [state, type]);

  return (
    <CardPanel className="UserStatusBlock" style={{ height: "100%" }} title={card.title}>
      <Typography.Text className="color-info">{realStatus?.title}</Typography.Text>
      <div className="value">{realStatus?.value}</div>
    </CardPanel>
  );
}
