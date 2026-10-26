/**
 * Actions queued until the instance stops (port of mod-manager/useDeferredTasks.ts).
 * On Windows a running server locks its jars, so delete/toggle/download can be
 * queued. Each queued task is also sent to the daemon with `deferred: true`
 * so it runs even if this browser closes.
 */
import { App } from "antd";
import { useCallback, useRef, useState } from "react";
import { t } from "@/lang/i18n";
import { deleteModApi, downloadModApi, toggleModApi } from "@/services/apis/modManager";
import { getRandomId } from "@/tools/common";
import { useStoredState } from "./storage";

export type DeferredType = "download" | "delete" | "toggle";

export interface DeferredTask {
  id: string;
  type: DeferredType;
  name: string;
  data: Record<string, any>;
  time: number;
}

const isTaskList = (v: unknown): v is DeferredTask[] =>
  Array.isArray(v) &&
  v.every(
    (x) =>
      x &&
      typeof x.id === "string" &&
      ["download", "delete", "toggle"].includes(x.type) &&
      typeof x.name === "string" &&
      x.data &&
      typeof x.data === "object" &&
      typeof x.time === "number"
  );
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

async function send(task: Pick<DeferredTask, "type" | "data">) {
  const data = { ...task.data, deferred: true } as any;
  if (task.type === "download") await downloadModApi({ forceRequest: true, data });
  else if (task.type === "delete") await deleteModApi({ forceRequest: true, data });
  else if (task.type === "toggle") await toggleModApi({ forceRequest: true, data });
}

export function useDeferredTasks(instanceId: string, reloadFn?: () => Promise<void>) {
  const { message } = App.useApp();
  const [deferredTasks, setDeferredTasks] = useStoredState<DeferredTask[]>(`mcs_mod_deferred_tasks_${instanceId}`, [], isTaskList);
  const [autoExecute, setAutoExecute] = useStoredState<boolean>(`mcs_mod_auto_execute_${instanceId}`, true, isBool);
  const [isExecuting, setExecuting] = useState(false);
  const tasksRef = useRef(deferredTasks);
  tasksRef.current = deferredTasks;
  const reloadRef = useRef(reloadFn);
  reloadRef.current = reloadFn;

  const addDeferredTask = useCallback(
    async (type: DeferredType, name: string, data: Record<string, any>) => {
      const task: DeferredTask = { id: getRandomId(), type, name, data, time: Date.now() };
      setDeferredTasks((list) => [...list, task]);
      message.success(t("TXT_CODE_MOD_DEFERRED_TASK_ADDED"));
      try {
        await send(task);
      } catch (err) {
        console.error("Failed to sync deferred task to backend:", err);
      }
    },
    [message, setDeferredTasks]
  );

  const removeDeferredTask = useCallback((id: string) => setDeferredTasks((list) => list.filter((x) => x.id !== id)), [setDeferredTasks]);

  const executeDeferredTask = useCallback(
    async (task: DeferredTask, reload = true) => {
      try {
        await send(task);
        removeDeferredTask(task.id);
        message.success(`${t("TXT_CODE_7f0c746d")}: ${task.name}`);
        if (reload && reloadRef.current) await reloadRef.current();
      } catch (err) {
        message.error(`${task.name}: ${(err as Error).message}`);
      }
    },
    [message, removeDeferredTask]
  );

  const executeAllDeferredTasks = useCallback(async () => {
    const tasks = [...tasksRef.current];
    if (isExecuting || tasks.length === 0) return;
    setExecuting(true);
    try {
      message.info(t("TXT_CODE_MOD_DEFERRED_REMIND_DESC", { count: tasks.length }));
      for (const task of tasks) await executeDeferredTask(task, false);
      if (reloadRef.current) await reloadRef.current();
    } finally {
      setExecuting(false);
    }
  }, [isExecuting, message, executeDeferredTask]);

  return { deferredTasks, setDeferredTasks, autoExecute, setAutoExecute, isExecuting, addDeferredTask, removeDeferredTask, executeDeferredTask, executeAllDeferredTasks };
}
