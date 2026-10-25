/** Port of DataStatistic.vue: icon + title + value block. */
import type { ComponentType } from "react";
import "./DataStatistic.scss";

export default function DataStatistic({ title, value, icon: Icon }: { title: string; value: string; icon?: ComponentType<{ className?: string }> }) {
  return (
    <div className="data-statistic">
      <div className="title">
        {Icon && <Icon className="title-icon" />}
        <span style={{ opacity: 0.7 }}>{title}</span>
      </div>
      <div className="content">{value}</div>
    </div>
  );
}
