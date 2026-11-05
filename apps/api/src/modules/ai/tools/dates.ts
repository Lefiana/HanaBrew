import { zonedParts, zonedWallTimeToInstant } from "@hanabrew/contracts";
import { ToolError } from "./tool.js";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function assertDate(value: string, label = "date"): string {
  const m = DATE.exec(value);
  if (!m || !validDate(Number(m[1]), Number(m[2]), Number(m[3])))
    throw new ToolError(`${label} must be a real date in YYYY-MM-DD format.`);
  return value;
}

/** "YYYY-MM-DD HH:mm" (or with a T) as wall time in `timeZone`, converted to the exact instant. */
export function parseLocalDateTime(value: string, timeZone: string, label = "time"): Date {
  const m = DATETIME.exec(value);
  if (!m)
    throw new ToolError(
      `${label} must look like YYYY-MM-DDTHH:mm (local time), e.g. 2026-11-05T14:30.`,
    );
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (!validDate(y, mo, d) || h > 23 || mi > 59)
    throw new ToolError(`${label} isn't a real date and time.`);
  return zonedWallTimeToInstant({ year: y, month: mo, day: d, hour: h, minute: mi }, timeZone);
}

/** An instant rendered as local "YYYY-MM-DD HH:mm" in the user's zone (what the model should see and say). */
export function formatLocal(instant: Date | string, timeZone: string): string {
  const p = zonedParts(new Date(instant), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}
