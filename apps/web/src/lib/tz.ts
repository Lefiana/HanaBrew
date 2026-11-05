/**
 * Time-zone helpers built on Intl (no dependency). Terminology:
 *  - "date key": a calendar date as "YYYY-MM-DD" (no zone).
 *  - "wall time": year/month/day/hour/minute as a person reads it on a clock in some zone.
 *  - "instant": an exact moment (a JS Date / epoch ms).
 */
import { zonedParts, zonedWallTimeToInstant } from "@hanabrew/contracts";

export { zonedParts, zonedWallTimeToInstant, type ZonedParts } from "@hanabrew/contracts";

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function parseDateKey(key: string): DateParts {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

export function toDateKey({ year, month, day }: DateParts): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function addDays(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return toDateKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

/** Adds calendar months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(key: string, months: number): string {
  const { year, month, day } = parseDateKey(key);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return toDateKey({
    year: target.getUTCFullYear(),
    month: target.getUTCMonth() + 1,
    day: Math.min(day, lastDay),
  });
}

export function weekdayOfKey(key: string): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function zonedDateKey(instant: Date | number, timeZone: string): string {
  const { year, month, day } = zonedParts(instant, timeZone);
  return toDateKey({ year, month, day });
}

export function startOfZonedDay(key: string, timeZone: string): Date {
  return zonedWallTimeToInstant({ ...parseDateKey(key) }, timeZone);
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function formatTime(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(instant));
}

/** Formats a date key. Date keys are zone-less, so they are formatted in UTC to avoid any shift. */
export function formatDateKey(
  key: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  const { year, month, day } = parseDateKey(key);
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
