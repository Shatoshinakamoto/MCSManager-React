/**
 * Console command history (port of upstream hooks/useCommandHistory.ts).
 * SECURITY: stored in this browser's localStorage only; the stored value is
 * shape-checked before use (CWE-20). Do not type secrets as console commands.
 */
import { useState, type KeyboardEvent } from "react";

const TERMINAL_HISTORY_KEY = "TERMINAL_HISTORY_KEY";
const MAX_ITEMS = 30;

function readAll(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(TERMINAL_HISTORY_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

export function setHistory(text: string) {
  if (!text) return;
  const history = readAll().filter((h) => h !== text);
  history.unshift(text);
  try {
    localStorage.setItem(TERMINAL_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_ITEMS)));
  } catch {
    /* storage blocked: history is not kept */
  }
}

export function useCommandHistory() {
  const [commandInputValue, setCommandInputValue] = useState("");
  const [history, setHistoryList] = useState<string[]>([]);
  const [focusHistoryList, setFocus] = useState(false);
  const [selectLocation, setSelectLocation] = useState(0);

  const getHistory = () => readAll().filter((item) => item.startsWith(commandInputValue)).slice(0, 10);

  const openHistoryList = () => {
    setHistoryList(getHistory());
    setFocus(true);
    setSelectLocation(0);
  };
  const closeHistoryList = () => setFocus(false);
  const clickHistoryItem = (item: string) => {
    setCommandInputValue(item);
    closeHistoryList();
  };

  /** Same keys as upstream: arrows open/move, Enter picks, Escape closes, anything else closes. */
  const handleHistorySelect = (e: KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Enter" && e.key !== "Escape") {
      if (focusHistoryList) closeHistoryList();
      return;
    }
    if (e.key === "Escape") return closeHistoryList();
    if (e.key === "Enter" && !focusHistoryList) return;
    if (!focusHistoryList) return openHistoryList();
    e.preventDefault();
    const n = history.length;
    if (e.key === "ArrowUp") setSelectLocation((s) => (s <= 0 ? n - 1 : s - 1));
    if (e.key === "ArrowDown") setSelectLocation((s) => (s >= n - 1 ? 0 : s + 1));
    if (e.key === "Enter") {
      setCommandInputValue(history[selectLocation] ?? "");
      closeHistoryList();
    }
  };

  return { history, focusHistoryList, selectLocation, commandInputValue, setCommandInputValue, clickHistoryItem, handleHistorySelect };
}
