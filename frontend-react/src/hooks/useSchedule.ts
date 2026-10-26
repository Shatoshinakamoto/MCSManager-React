/**
 * Scheduled tasks for one instance (port of upstream hooks/useSchedule.ts).
 *
 * The time string formats are the daemon's:
 *  - interval: total seconds, e.g. "3600"
 *  - cycle:    cron "s m h * * w1,w2"
 *  - specify:  cron "s m h dd mm *"
 * The panel validates field types and rejects names with path characters;
 * the daemon owns execution. Commands in actions run in the instance console
 * with the user's instance permissions, nothing more.
 */
import { App } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useState } from "react";
import { t } from "@/lang/i18n";
import { scheduleCreate, scheduleDelete, scheduleList } from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import { ScheduleCreateType, type Schedule, type ScheduleTaskForm } from "@/types/schedule";

/** Build the daemon time string for a form; throws a user-facing Error when incomplete. */
export function scheduleTimeFromForm(task: ScheduleTaskForm): string {
  if (task.type === ScheduleCreateType.INTERVAL) {
    const [s, m, h] = task.cycle.map(Number);
    return String(s + m * 60 + h * 3600);
  }
  if (!task.objTime) throw new Error(t("TXT_CODE_349edc57"));
  const time = task.objTime;
  if (task.type === ScheduleCreateType.CYCLE) {
    if (task.weekend.length === 0) throw new Error(t("TXT_CODE_2fe0cc84"));
    return `${time.second()} ${time.minute()} ${time.hour()} * * ${task.weekend.join(",")}`;
  }
  return `${time.second()} ${time.minute()} ${time.hour()} ${time.date()} ${time.month() + 1} *`;
}

export function calculateIntervalFromTime(time: string): string[] {
  const total = Number(time);
  return [String(total % 60), String(Math.floor((total % 3600) / 60)), String(Math.floor(total / 3600))];
}

/** Parse "s m h * * w" back into a time and weekday list; undefined when malformed. */
export function calculateTimeFromCycle(time: string): { objTime: Dayjs; weekend: number[] } | undefined {
  const match = time.match(/(\d+) (\d+) (\d+) \* \* (.+)/);
  if (!match) return undefined;
  const objTime = dayjs().hour(Number(match[3])).minute(Number(match[2])).second(Number(match[1]));
  return { objTime, weekend: match[4].split(",").map(Number) };
}

/** Parse "s m h dd mm *" back into a date; undefined when malformed. */
export function parseTaskTime(time: string): Dayjs | undefined {
  const match = time.match(/(\d+) (\d+) (\d+) (\d+) (\d+) \*/);
  if (!match) return undefined;
  return dayjs()
    .month(Number(match[5]) - 1)
    .date(Number(match[4]))
    .hour(Number(match[3]))
    .minute(Number(match[2]))
    .second(Number(match[1]));
}

/** Create a task. An empty count means "unlimited" (-1). Throws on failure. */
export async function createSchedule(instanceId: string, daemonId: string, task: Pick<Schedule, "name" | "count" | "time" | "type" | "actions">) {
  await scheduleCreate({
    forceRequest: true,
    params: { daemonId, uuid: instanceId },
    data: { name: task.name, count: task.count === "" || !Number(task.count) ? -1 : Number(task.count), time: task.time, type: task.type, actions: task.actions }
  });
}

export async function removeSchedule(instanceId: string, daemonId: string, name: string) {
  return scheduleDelete({ forceRequest: true, params: { daemonId, uuid: instanceId, task_name: name } });
}

export function useSchedule(instanceId: string, daemonId: string) {
  const { message } = App.useApp();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);

  const getScheduleList = useCallback(async () => {
    setLoading(true);
    try {
      setSchedules((await scheduleList({ forceRequest: true, params: { daemonId, uuid: instanceId } })) ?? []);
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setLoading(false);
    }
  }, [instanceId, daemonId]);

  const deleteSchedule = useCallback(
    async (name: string) => {
      try {
        if (await removeSchedule(instanceId, daemonId, name)) {
          message.success(t("TXT_CODE_28190dbc"));
          await getScheduleList();
        }
      } catch (err) {
        reportErrorMsg(err);
      }
    },
    [instanceId, daemonId, getScheduleList, message]
  );

  return { schedules, loading, getScheduleList, deleteSchedule };
}
