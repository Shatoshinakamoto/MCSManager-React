/**
 * ECharts helpers (port of upstream hooks/useOverviewChart.ts): the same two
 * default line-chart styles, bound to a React ref and disposed on unmount.
 *
 * SECURITY: tooltip formatters build HTML, so every value is coerced to a
 * number or escaped first (CWE-79). echarts is pinned to 6.1.0, which fixes
 * GHSA-fgmj-fm8m-jvvx (XSS) present in upstream's 5.x.
 */
import { graphic, init, type ECharts, type EChartsOption } from "echarts";
import { useEffect, useRef, type RefObject } from "react";

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const TOOLTIP_BASE = {
  trigger: "axis" as const,
  backgroundColor: "rgba(20, 24, 35, 0.85)",
  borderColor: "rgba(67, 145, 250, 0.3)",
  borderWidth: 1,
  padding: [6, 10],
  textStyle: { color: "#e0e6f0", fontSize: 12 },
  axisPointer: { type: "line" as const, lineStyle: { color: "rgba(67, 145, 250, 0.5)", width: 1, type: "dashed" as const } }
};

const SPLIT_LINE = { show: true, lineStyle: { color: "rgba(100, 130, 180, 0.12)", type: "dashed" as const, width: 1 } };
const AXIS_LABEL = { fontSize: 10, color: "rgba(160, 180, 210, 0.7)", margin: 4 };

function lineSeries() {
  return {
    type: "line" as const,
    smooth: 0.6,
    smoothMonotone: "x" as const,
    showSymbol: false,
    lineStyle: { color: "rgba(67, 145, 250, 0.95)", width: 1.5, shadowColor: "rgba(67, 145, 250, 0.3)", shadowBlur: 4 },
    areaStyle: {
      color: new graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: "rgba(67, 145, 250, 0.55)" },
        { offset: 0.6, color: "rgba(40, 100, 210, 0.15)" },
        { offset: 1, color: "rgba(17, 60, 150, 0)" }
      ])
    }
  };
}

type Param = { data?: unknown; value?: unknown; axisValue?: unknown };

function pick(params: unknown): Param {
  return (Array.isArray(params) ? params[0] : params) as Param;
}

export function overviewChartOption(): EChartsOption {
  return {
    tooltip: {
      ...TOOLTIP_BASE,
      formatter: (params: unknown) => {
        const p = pick(params);
        const d = p.data as Record<string, unknown> | undefined;
        const isObj = typeof d === "object" && d !== null && !Array.isArray(d);
        const val = isObj ? (d.value ?? d.runningInstance) : Array.isArray(p.value) ? p.value[1] : p.value;
        const x = isObj ? d.time : p.axisValue;
        const num = Number(val);
        const shown = Number.isFinite(num) ? (Number.isInteger(num) ? num : num.toFixed(1)) : "-";
        return `<span style="color:#94b8e0;font-size:11px">${esc(x)}</span><br/><span style="font-weight:600;font-size:13px">${shown}</span>`;
      }
    },
    grid: { show: false, borderWidth: 0, top: 8, bottom: 30, left: 34, right: 8 },
    xAxis: { type: "category", show: true, axisLabel: AXIS_LABEL, axisLine: { show: true, lineStyle: { color: "rgba(100, 130, 180, 0.2)" } }, axisTick: { show: false } },
    yAxis: { type: "value", min: 0, max: 100, show: true, minInterval: 1, axisLabel: { formatter: "{value}", ...AXIS_LABEL }, splitLine: SPLIT_LINE, axisLine: { show: false }, axisTick: { show: false } },
    series: [lineSeries()]
  };
}

export function simpleChartOption(): EChartsOption {
  return {
    tooltip: {
      ...TOOLTIP_BASE,
      formatter: (params: unknown) => {
        const p = pick(params);
        const d = p.data as Record<string, unknown> | undefined;
        const isObj = typeof d === "object" && d !== null && !Array.isArray(d);
        const val = Number(isObj ? d.value : Array.isArray(p.value) ? p.value[1] : p.value);
        const x = isObj ? d.time : p.axisValue;
        return `<span style="color:#94b8e0;font-size:11px">#${esc(x)}</span><br/><span style="font-weight:600;font-size:13px">${Number.isFinite(val) ? val.toFixed(1) : "-"}<span style="font-size:11px;font-weight:400;margin-left:1px">%</span></span>`;
      }
    },
    grid: { show: false, borderWidth: 0, top: 6, bottom: 4, left: 34, right: 6 },
    xAxis: { type: "category", show: false },
    yAxis: { type: "value", min: 0, max: 100, show: true, interval: 50, axisLabel: { formatter: "{value}%", ...AXIS_LABEL }, splitLine: SPLIT_LINE, axisLine: { show: false }, axisTick: { show: false } },
    series: [lineSeries()]
  };
}

/** Mount an ECharts instance on `ref`, resize with the element, dispose on unmount. */
export function useEChart(ref: RefObject<HTMLDivElement | null>, initial: () => EChartsOption) {
  const chart = useRef<ECharts | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const c = init(ref.current);
    c.setOption(initial());
    chart.current = c;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => c.resize()) : null;
    ro?.observe(ref.current);
    return () => {
      ro?.disconnect();
      c.dispose();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return chart;
}
