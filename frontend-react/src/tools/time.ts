/** Date helpers (port of upstream tools/time.ts). */
import dayjs from "dayjs";

export function parseTimestamp(st = 0) {
  if (!st) return "";
  return dayjs(st).format("YYYY-MM-DD HH:mm:ss");
}
