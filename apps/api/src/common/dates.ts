/** Parses "YYYY-MM-DD" into a Date at 00:00:00Z (the representation Prisma uses for @db.Date). */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** The calendar date "today" in an IANA zone, as YYYY-MM-DD. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Adds calendar days to a "YYYY-MM-DD" key. */
export function addDaysToKey(key: string, days: number): string {
  const date = parseDateOnly(key);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

/** 0 = Sunday ... 6 = Saturday, for a "YYYY-MM-DD" key. */
export function weekdayOfKey(key: string): number {
  return parseDateOnly(key).getUTCDay();
}
