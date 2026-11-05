/**
 * Time-zone maths built on Intl (no dependency), shared by the web app and the API.
 *  - "wall time": year/month/day/hour/minute as read on a clock in some zone.
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
