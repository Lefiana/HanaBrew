import {
  instantsToAllDayDates,
  type CalendarDeadlines,
  type CalendarEvent,
  type Project,
  type Task,
} from "@hanabrew/contracts";
import {
  addDays,
  addMonths,
  parseDateKey,
  startOfZonedDay,
  toDateKey,
  weekdayOfKey,
} from "@/lib/tz";

export type CalendarView = "month" | "week" | "day";
/** 0 = Sunday, 1 = Monday. Change this single constant to switch the calendar's first day. */
export const WEEK_STARTS_ON = 0;
const MIN_EVENT_MINUTES = 20;

export interface DayCell {
  key: string;
  day: number;
  inMonth: boolean;
}

export function weekStart(key: string, weekStartsOn = WEEK_STARTS_ON): string {
  const offset = (weekdayOfKey(key) - weekStartsOn + 7) % 7;
  return addDays(key, -offset);
}

export function weekKeys(anchorKey: string, weekStartsOn = WEEK_STARTS_ON): string[] {
  const start = weekStart(anchorKey, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Always six weeks so the grid doesn't jump in height between months. */
export function monthGrid(anchorKey: string, weekStartsOn = WEEK_STARTS_ON): DayCell[][] {
  const { year, month } = parseDateKey(anchorKey);
  const first = toDateKey({ year, month, day: 1 });
  const gridStart = weekStart(first, weekStartsOn);
  return Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 7 }, (_, col) => {
      const key = addDays(gridStart, row * 7 + col);
      const parts = parseDateKey(key);
      return { key, day: parts.day, inMonth: parts.month === month && parts.year === year };
    }),
  );
}

export function visibleKeys(
  view: CalendarView,
  anchorKey: string,
  weekStartsOn = WEEK_STARTS_ON,
): string[] {
  if (view === "day") return [anchorKey];
  if (view === "week") return weekKeys(anchorKey, weekStartsOn);
  return monthGrid(anchorKey, weekStartsOn)
    .flat()
    .map((cell) => cell.key);
}

/** The half-open instant range [from, to) the API should be asked for. */
export function viewRange(
  view: CalendarView,
  anchorKey: string,
  timeZone: string,
  weekStartsOn = WEEK_STARTS_ON,
) {
  const keys = visibleKeys(view, anchorKey, weekStartsOn);
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  return {
    from: startOfZonedDay(first, timeZone).toISOString(),
    to: startOfZonedDay(addDays(last, 1), timeZone).toISOString(),
  };
}

export function navigate(view: CalendarView, anchorKey: string, direction: -1 | 1): string {
  if (view === "month") return addMonths(anchorKey, direction);
  return addDays(anchorKey, direction * (view === "week" ? 7 : 1));
}

export function eventsForDay(events: CalendarEvent[], dayKey: string, timeZone: string) {
  const dayStart = startOfZonedDay(dayKey, timeZone).getTime();
  const dayEnd = startOfZonedDay(addDays(dayKey, 1), timeZone).getTime();
  const allDay: CalendarEvent[] = [];
  const timed: CalendarEvent[] = [];
  for (const event of events) {
    if (event.allDay) {
      // All-day events are floating dates: compare date keys, never instants.
      const { startDate, endDate } = instantsToAllDayDates(event.start, event.end);
      if (startDate <= dayKey && dayKey <= endDate) allDay.push(event);
    } else if (
      new Date(event.start).getTime() < dayEnd &&
      new Date(event.end).getTime() > dayStart
    ) {
      timed.push(event);
    }
  }
  return { allDay, timed };
}

export interface PositionedEvent {
  event: CalendarEvent;
  /** Minutes from the start of the day. */
  top: number;
  height: number;
  column: number;
  columns: number;
}

/** Places timed events on a day's grid; overlapping events share the width in side-by-side columns. */
export function layoutDay(
  timed: CalendarEvent[],
  dayKey: string,
  timeZone: string,
): PositionedEvent[] {
  const dayStart = startOfZonedDay(dayKey, timeZone).getTime();
  const dayEnd = startOfZonedDay(addDays(dayKey, 1), timeZone).getTime();
  const minutes = (ms: number) => (ms - dayStart) / 60_000;

  const items = timed
    .map((event) => {
      const start = Math.max(new Date(event.start).getTime(), dayStart);
      const end = Math.min(new Date(event.end).getTime(), dayEnd);
      const top = minutes(start);
      return { event, top, bottom: Math.max(minutes(end), top + MIN_EVENT_MINUTES) };
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  const positioned: PositionedEvent[] = [];
  let cluster: PositionedEvent[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const item of cluster) item.columns = columnEnds.length;
    positioned.push(...cluster);
    cluster = [];
    columnEnds = [];
  };

  for (const item of items) {
    if (item.top >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= item.top);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = item.bottom;
    cluster.push({
      event: item.event,
      top: item.top,
      height: item.bottom - item.top,
      column,
      columns: 1,
    });
    clusterEnd = Math.max(clusterEnd, item.bottom);
  }
  flush();
  return positioned;
}

/** Deadlines are floating dates, so matching is by date key and never depends on the viewer's zone. */
export function deadlinesForDay(
  deadlines: CalendarDeadlines | undefined,
  dayKey: string,
): { tasks: Task[]; projects: Project[] } {
  return {
    tasks: (deadlines?.tasks ?? []).filter((task) => task.dueDate === dayKey),
    projects: (deadlines?.projects ?? []).filter((project) => project.targetDate === dayKey),
  };
}
