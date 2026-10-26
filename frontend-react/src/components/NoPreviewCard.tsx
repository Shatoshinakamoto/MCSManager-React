/**
 * Stand-in shown where a card cannot be previewed, for example in design mode
 * (port of components/NoPreviewCard.vue). Upstream ships it but no page uses
 * it yet; it takes the same `card` prop as every widget.
 */
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { Typography } from "antd";
import CardPanel from "@/components/CardPanel";
import type { WidgetProps } from "@/config/widgets";
import { t } from "@/lang/i18n";

export default function NoPreviewCard({ card }: WidgetProps) {
  return (
    <CardPanel className="NoPreviewCard h-100" style={{ height: "100%" }} title={card.title}>
      <div className="flex justify-center align-center h-100">
        <Typography.Paragraph style={{ maxWidth: 320, margin: "auto", textAlign: "center" }}>
          <ExclamationCircleOutlined /> {t("TXT_CODE_5ec10cc8")}
        </Typography.Paragraph>
      </div>
    </CardPanel>
  );
}
