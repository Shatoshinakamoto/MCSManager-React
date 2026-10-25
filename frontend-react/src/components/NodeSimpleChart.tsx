/** Port of NodeSimpleChart.vue: CPU and memory sparkline charts for one node. */
import { Col, Flex, Row } from "antd";
import { useEffect, useRef } from "react";
import { simpleChartOption, useEChart } from "@/hooks/useOverviewChart";
import { t } from "@/lang/i18n";
import "./NodeSimpleChart.scss";

interface Props {
  cpuData: number[];
  memData: number[];
  cpuUsage: string;
  memUsage: string;
  className?: string;
}

const toSource = (arr: number[]) => arr.map((value, time) => ({ value, time }));

export default function NodeSimpleChart({ cpuData, memData, cpuUsage, memUsage, className }: Props) {
  const cpuEl = useRef<HTMLDivElement>(null);
  const memEl = useRef<HTMLDivElement>(null);
  const cpu = useEChart(cpuEl, simpleChartOption);
  const mem = useEChart(memEl, simpleChartOption);
  useEffect(() => {
    cpu.current?.setOption({ dataset: { dimensions: ["time", "value"], source: toSource(cpuData) } });
    mem.current?.setOption({ dataset: { dimensions: ["time", "value"], source: toSource(memData) } });
  }, [cpuData, memData, cpu, mem]);
  return (
    <div className={["node-simple-chart", className].filter(Boolean).join(" ")} style={{ width: "100%" }}>
      <Row gutter={[24, 24]}>
        <Col span={12}>
          <Flex justify="space-between" align="center">
            <span className="usage-title">{t("TXT_CODE_eca8f1b3")}</span>
            <span className="usage-info">{cpuUsage}</span>
          </Flex>
          <div ref={cpuEl} className="node-chart-container" />
        </Col>
        <Col span={12}>
          <Flex justify="space-between" align="center">
            <span className="usage-title">{t("TXT_CODE_6ca6667f")}</span>
            <span className="usage-info">{memUsage}</span>
          </Flex>
          <div ref={memEl} className="node-chart-container" />
        </Col>
      </Row>
    </div>
  );
}
