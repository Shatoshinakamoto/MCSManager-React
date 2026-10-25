/** Placeholder shown on custom pages with no cards yet (port of widgets/DefaultCard.vue). */
import { Empty, Typography } from "antd";
import CardPanel from "@/components/CardPanel";
import type { WidgetProps } from "@/config/widgets";
import { t } from "@/lang/i18n";
import { useIsAdmin } from "@/stores/appState";
import "./DefaultCard.scss";

const removeTrail = (origin: string, trail: string) => (origin.endsWith(trail) ? origin.slice(0, origin.length - trail.length) : origin);

export default function DefaultCard({ card }: WidgetProps) {
  const isAdmin = useIsAdmin();
  const myAddr = `${removeTrail(window.location.pathname, "/")}/#/_open_page`;
  return (
    <CardPanel className="DefaultCard CardWrapper h-100 w-100" style={{ height: "100%" }} title={card.title}>
      <div className="h-100 w-100">
        <Empty
          styles={{ image: { height: 140 } }}
          description={
            isAdmin ? (
              <div className="admin-text">
                <Typography.Paragraph>
                  <p>{t("TXT_CODE_2c7bcdfa")}</p>
                  <p>{t("TXT_CODE_da579edc")}</p>
                  <p>{t("TXT_CODE_4d50f316")}</p>
                  <p>
                    {t("TXT_CODE_d324bb21")}{" "}
                    <a href={myAddr} target="_blank" rel="noopener noreferrer">
                      {myAddr}
                    </a>
                  </p>
                </Typography.Paragraph>
              </div>
            ) : (
              <div>
                <Typography.Paragraph>
                  <p>{t("TXT_CODE_e15e5006")}</p>
                </Typography.Paragraph>
              </div>
            )
          }
        />
      </div>
    </CardPanel>
  );
}
