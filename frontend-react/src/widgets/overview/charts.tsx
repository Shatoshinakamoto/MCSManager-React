/** RequestChart and InstanceChart (ports of RequestChart.vue and InstanceChart.vue). */
import { useEffect, useRef } from "react";
import CardPanel from "@/components/CardPanel";
import type { WidgetProps } from "@/config/widgets";
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { overviewChartOption, useEChart } from "@/hooks/useOverviewChart";

function withTime<T extends object>(source: T[]): (T & { time: string })[] {
  const max = source.length - 1;
  return source.map((v, i) => ({ ...v, time: `${max - i}s` }));
}

export function RequestChart({ card }: WidgetProps) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useEChart(el, overviewChartOption);
  const { state } = useOverviewInfo();
  useEffect(() => {
    const source = state?.chart.request;
    if (!source || !chart.current) return;
    chart.current.setOption({
      yAxis: { max: Math.max(...source.map((v) => v.value)) },
      dataset: { dimensions: ["time", "value"], source: withTime(source) }
    });
  }, [state, chart]);
  return (
    <CardPanel className="CardWrapper" title={card.title} style={{ height: "100%" }}>
      <div ref={el} style={{ width: "100%", height: "100%" }} />
    </CardPanel>
  );
}

export function InstanceChart({ card }: WidgetProps) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useEChart(el, overviewChartOption);
  const { state } = useOverviewInfo();
  useEffect(() => {
    const source = state?.chart.request;
    if (!source || !chart.current) return;
    const total = state?.totalInstance ?? 0;
    chart.current.setOption({
      yAxis: { max: !total || total <= 1 ? 1 : total },
      dataset: { dimensions: ["time", "runningInstance"], source: withTime(source) }
    });
  }, [state, chart]);
  return (
    <CardPanel className="CardWrapper" title={card.title} style={{ height: "100%" }}>
      <div ref={el} style={{ width: "100%", height: "100%" }} />
    </CardPanel>
  );
}
