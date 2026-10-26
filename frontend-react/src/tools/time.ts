/** Date helpers (port of upstream tools/time.ts). */
import dayjs, { type Dayjs } from "dayjs";

export function parseTimestamp(st = 0) {
  if (!st) return "";
  return dayjs(st).format("YYYY-MM-DD HH:mm:ss");
}

/** Date picker value to epoch ms (0 when cleared), as upstream tools/time.ts. */
export function dayjsToTimestamp(value?: Dayjs | null) {
  if (!value) return 0;
  return value.valueOf();
}

/** Epoch ms to a date picker value (undefined when unset). */
export function timestampToDayjs(st = 0) {
  if (!st) return undefined;
  return dayjs(st);
}
