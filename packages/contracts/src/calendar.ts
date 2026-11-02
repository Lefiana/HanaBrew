import { z } from "zod";
import {
  MS_PER_DAY,
  isoDateSchema,
  isoInstantSchema,
  timeZoneSchema,
  uuidSchema,
} from "./common.js";
import { projectSchema } from "./projects.js";
import { taskSchema } from "./tasks.js";

/**
 * TIME MODEL
 *  - Timed events: `start` / `end` are exact instants (UTC `Z` on output). `timeZone` records the
 *    zone the event was created in; clients render in the user's configured zone.
 *  - All-day events are FLOATING dates: `start` is 00:00:00Z of the first day and `end` is 00:00:00Z of
 *    the day AFTER the last day (exclusive, like iCalendar). They never shift between zones.
 *    Use `allDayToInstants` / `instantsToAllDayDates` to convert from/to inclusive "YYYY-MM-DD" dates.
 */
export const MAX_EVENT_SPAN_DAYS = 366;
export const MAX_RANGE_DAYS = 100;

export const calendarEventSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  allDay: z.boolean(),
  start: isoInstantSchema,
  end: isoInstantSchema,
  timeZone: z.string(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export function allDayToInstants(
  startDate: string,
  endDateInclusive: string,
): { start: string; end: string } {
  const end = new Date(`${endDateInclusive}T00:00:00.000Z`).getTime() + MS_PER_DAY;
  return { start: `${startDate}T00:00:00.000Z`, end: new Date(end).toISOString() };
}

export function instantsToAllDayDates(
  start: string,
  end: string,
): { startDate: string; endDate: string } {
  const lastDay = new Date(new Date(end).getTime() - MS_PER_DAY).toISOString();
  return { startDate: new Date(start).toISOString().slice(0, 10), endDate: lastDay.slice(0, 10) };
}

/** Business rules for event times. Returns an error message or null. Shared by API and web form. */
export function validateEventTimes(input: {
  allDay: boolean;
  start: string;
  end: string;
}): string | null {
  const start = new Date(input.start).getTime();
  const end = new Date(input.end).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "Start and end must be valid times.";
  if (end <= start) return "The event must end after it starts.";
  if ((end - start) / MS_PER_DAY > MAX_EVENT_SPAN_DAYS)
    return `Events can span at most ${MAX_EVENT_SPAN_DAYS} days.`;
  if (input.allDay && (start % MS_PER_DAY !== 0 || end % MS_PER_DAY !== 0)) {
    return "All-day events must start and end at midnight UTC (use whole dates).";
  }
  return null;
}

const titleSchema = z.string().trim().min(1, "Title is required.").max(200);
const descriptionSchema = z.string().max(5000);
const categorySchema = z.string().trim().min(1).max(30);

export const createCalendarEventSchema = z
  .strictObject({
    title: titleSchema,
    description: descriptionSchema.nullish(),
    category: categorySchema.nullish(),
    allDay: z.boolean().optional(),
    start: isoInstantSchema,
    end: isoInstantSchema,
    timeZone: timeZoneSchema,
  })
  .superRefine((value, ctx) => {
    const message = validateEventTimes({
      allDay: value.allDay ?? false,
      start: value.start,
      end: value.end,
    });
    if (message) ctx.addIssue({ code: "custom", path: ["end"], message });
  });
export type CreateCalendarEventInput = z.input<typeof createCalendarEventSchema>;

/** PATCH: `start` and `end` must be sent together (they are validated as a pair). */
export const updateCalendarEventSchema = z
  .strictObject({
    title: titleSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    category: categorySchema.nullable().optional(),
    allDay: z.boolean().optional(),
    start: isoInstantSchema.optional(),
    end: isoInstantSchema.optional(),
    timeZone: timeZoneSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.")
  .refine((value) => (value.start === undefined) === (value.end === undefined), {
    message: "Send start and end together.",
    path: ["end"],
  });
export type UpdateCalendarEventInput = z.input<typeof updateCalendarEventSchema>;

export const listCalendarEventsQuerySchema = z
  .object({ from: isoInstantSchema, to: isoInstantSchema })
  .superRefine((value, ctx) => {
    const from = new Date(value.from).getTime();
    const to = new Date(value.to).getTime();
    if (to <= from)
      ctx.addIssue({ code: "custom", path: ["to"], message: "`to` must be after `from`." });
    else if ((to - from) / MS_PER_DAY > MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `Ask for at most ${MAX_RANGE_DAYS} days at a time.`,
      });
    }
  });
export type ListCalendarEventsQuery = z.input<typeof listCalendarEventsQuerySchema>;

/**
 * Deadlines shown on the calendar: open and completed tasks with a due date, and projects with a
 * target date, within [from, to] (inclusive calendar dates). Cancelled tasks and archived projects
 * are not deadlines. Dates are floating (no zone), like all-day events.
 */
export const listCalendarDeadlinesQuerySchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .superRefine((value, ctx) => {
    const from = new Date(`${value.from}T00:00:00Z`).getTime();
    const to = new Date(`${value.to}T00:00:00Z`).getTime();
    if (to < from)
      ctx.addIssue({ code: "custom", path: ["to"], message: "`to` can't be before `from`." });
    else if ((to - from) / MS_PER_DAY > MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `Ask for at most ${MAX_RANGE_DAYS} days at a time.`,
      });
    }
  });
export type ListCalendarDeadlinesQuery = z.input<typeof listCalendarDeadlinesQuerySchema>;

export const calendarDeadlinesSchema = z.object({
  tasks: z.array(taskSchema),
  projects: z.array(projectSchema),
});
export type CalendarDeadlines = z.infer<typeof calendarDeadlinesSchema>;
