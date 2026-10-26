/**
 * Scheduled task types (port of upstream types/index.ts and types/const.ts).
 * Labels are functions so they follow the current language.
 */
import type { Dayjs } from "dayjs";
import { t } from "@/lang/i18n";

export enum ScheduleActionTypeEnum {
  Delay = "delay",
  Command = "command",
  Stop = "stop",
  Start = "start",
  Restart = "restart",
  Kill = "kill"
}

export const ScheduleTypeEnum = {
  Interval: 1,
  Cycle: 2,
  Specify: 3
};

export const scheduleActionTypeLabels = (): Record<string, string> => ({
  [ScheduleActionTypeEnum.Delay]: t("TXT_CODE_735baf9f"),
  [ScheduleActionTypeEnum.Command]: t("TXT_CODE_b7cab91d"),
  [ScheduleActionTypeEnum.Stop]: t("TXT_CODE_148d6467"),
  [ScheduleActionTypeEnum.Start]: t("TXT_CODE_8c7318b3"),
  [ScheduleActionTypeEnum.Restart]: t("TXT_CODE_77cc12da"),
  [ScheduleActionTypeEnum.Kill]: t("TXT_CODE_1c36c8f2")
});

export const scheduleTypeLabels = (): Record<number, string> => ({
  [ScheduleTypeEnum.Interval]: t("TXT_CODE_ba497a8b"),
  [ScheduleTypeEnum.Cycle]: t("TXT_CODE_f17af923"),
  [ScheduleTypeEnum.Specify]: t("TXT_CODE_c4f90da6")
});

export enum ScheduleCreateType {
  INTERVAL = 1,
  CYCLE,
  SPECIFY
}

export interface Schedule {
  instanceUuid: string;
  name: string;
  count: number | string;
  time: string;
  actions: ScheduleAction[];
  type: number;
}

export interface ScheduleAction {
  type: string;
  payload: string;
}

export interface NewScheduleTask {
  name: string;
  count: number | string;
  time: string;
  type: ScheduleCreateType;
}

export interface ScheduleTaskForm extends NewScheduleTask {
  weekend: number[];
  cycle: string[];
  actions: ScheduleAction[];
  objTime: Dayjs;
}
