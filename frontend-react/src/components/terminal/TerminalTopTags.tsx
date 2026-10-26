/**
 * Performance tags above the console (port of components/TerminalTopTags.vue):
 * CPU, memory, disk and network figures from the daemon's stream/detail data.
 * Clicking the bandwidth tag switches between bytes and bits per second; the
 * choice is kept in this browser's localStorage under "useByteUnit".
 */
import { Tag } from "antd";
import prettyBytes, { type Options as PrettyOptions } from "pretty-bytes";
import { useState } from "react";
import { t } from "@/lang/i18n";

export interface TerminalRuntimeInfo {
  cpuUsage?: number;
  memoryUsage?: number;
  memoryLimit?: number;
  memoryUsagePercent?: number;
  rxBytes?: number;
  txBytes?: number;
  rxRate?: number;
  txRate?: number;
  storageUsage?: number;
  storageLimit?: number;
}

interface PerfCardItem {
  key: string;
  label: string;
  value: string;
  theme: string;
  onClick?: () => void;
}

const BYTE_UNIT_KEY = "useByteUnit";
const prettyBytesConfig: PrettyOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2, binary: true };

function readByteUnit(): boolean {
  try {
    return localStorage.getItem(BYTE_UNIT_KEY) !== "false";
  } catch {
    return true;
  }
}

const formatMemoryUsage = (usage?: number, limit?: number) => {
  const fUsage = prettyBytes(usage ?? 0, prettyBytesConfig);
  const fLimit = prettyBytes(limit ?? 0, prettyBytesConfig);
  return limit ? `${fUsage} / ${fLimit}` : fUsage;
};
const formatTrafficUsage = (bytes?: number) => prettyBytes(bytes ?? 0, { ...prettyBytesConfig, binary: false });

export default function TerminalTopTags({ info, isStopped }: { info?: TerminalRuntimeInfo | null; isStopped: boolean }) {
  const [useByteUnit, setUseByteUnit] = useState(readByteUnit);
  if (!info || isStopped) return null;

  const toggleUnit = () => {
    const next = !useByteUnit;
    setUseByteUnit(next);
    try {
      localStorage.setItem(BYTE_UNIT_KEY, String(next));
    } catch {
      /* storage blocked: the choice lasts for this page only */
    }
  };
  const formatNetworkSpeed = (bytes?: number) =>
    useByteUnit
      ? prettyBytes(bytes ?? 0, { ...prettyBytesConfig, binary: false }) + "/s"
      : prettyBytes((bytes ?? 0) * 8, { ...prettyBytesConfig, bits: true, binary: false }).replace(/bit$/, "b") + "ps";

  const { cpuUsage, memoryUsage, memoryLimit, rxBytes, txBytes, rxRate, txRate, storageUsage, storageLimit } = info;
  const cpuStatus = cpuUsage != null && cpuUsage > 600 ? "error" : cpuUsage != null && cpuUsage > 200 ? "warning" : "normal";

  let cards = [
    cpuUsage != null && { key: "cpu", label: t("TXT_CODE_b862a158"), value: `${parseInt(String(cpuUsage))}%`, theme: `perf-card--cpu-${cpuStatus}` },
    memoryUsage != null && { key: "memory", label: t("TXT_CODE_593ee330"), value: formatMemoryUsage(memoryUsage, memoryLimit), theme: "perf-card--memory" },
    !!storageUsage && { key: "disk", label: t("TXT_CODE_DISK_USAGE"), value: formatMemoryUsage(storageUsage, storageLimit || 0), theme: "perf-card--disk" },
    (rxRate != null || txRate != null) && {
      key: "network-bandwidth",
      label: t("TXT_CODE_NETWORK_CURRENT"),
      value: `↓${formatNetworkSpeed(rxRate)} ↑${formatNetworkSpeed(txRate)}`,
      theme: "perf-card--network",
      onClick: toggleUnit
    },
    (rxBytes != null || txBytes != null) && {
      key: "network-traffic",
      label: t("TXT_CODE_NETWORK_TOTAL"),
      value: `↓${formatTrafficUsage(rxBytes)} ↑${formatTrafficUsage(txBytes)}`,
      theme: "perf-card--network"
    }
  ].filter(Boolean) as PerfCardItem[];
  if (window.innerWidth < 660) cards = cards.slice(0, 2);
  if (cards.length === 0) return null;

  return (
    <div className="perf-cards" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
      {cards.map((card) => (
        <Tag key={card.key} className={`card ${card.theme}`} style={{ userSelect: "none" }} onClick={card.onClick}>
          {card.label} {card.value}
        </Tag>
      ))}
    </div>
  );
}
