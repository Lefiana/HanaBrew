/**
 * Time-zone helpers built on Intl (no dependency). Terminology:
 *  - "date key": a calendar date as "YYYY-MM-DD" (no zone).
 *  - "wall time": year/month/day/hour/minute as a person reads it on a clock in some zone.
 *  - "instant": an exact moment (a JS Date / epoch ms).
 */
export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function zonedParts(instant: Date | number, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const value = (type: string): string => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")) % 24, // some engines render midnight as 24
    minute: Number(value("minute")),
    second: Number(value("second")),
    weekday: WEEKDAY_INDEX[value("weekday")] ?? 0,
  };
}

/** Offset of `timeZone` from UTC at an instant, in ms (positive east of Greenwich). */
function offsetMs(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
  );
}

/**
 * The instant at which a wall-clock time occurs in a zone. Two passes handle DST transitions.
 * A wall time that doesn't exist (spring-forward gap) resolves to the instant just after the gap.
 */
export function zonedWallTimeToInstant(
  wall: { year: number; month: number; day: number; hour?: number; minute?: number },
  timeZone: string,
): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour ?? 0, wall.minute ?? 0);
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone));
}

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
