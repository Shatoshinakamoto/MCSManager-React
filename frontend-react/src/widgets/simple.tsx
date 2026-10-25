/** Small layout widgets ported from TitleCard.vue, EmptyCard.vue and Page404.vue. */
import { ExclamationCircleTwoTone } from "@ant-design/icons";
import { Typography } from "antd";
import { t } from "@/lang/i18n";
import type { LayoutCard } from "@/types";

export function TitleCard({ card }: { card: LayoutCard }) {
  return (
    <div>
      <Typography.Title className="mb-0" level={4}>
        {card.title}
      </Typography.Title>
    </div>
  );
}

export function EmptyCard() {
  return <div className="empty-card-container" style={{ width: "100%", height: "100%" }} />;
}

export function Page404() {
  return (
    <div style={{ height: "100%" }}>
      <ExclamationCircleTwoTone style={{ fontSize: 70 }} />
      <Typography.Title className="mt-24" level={3}>
        {t("TXT_CODE_fd63a181")}
      </Typography.Title>
    </div>
  );
}
