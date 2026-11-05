import {
  allDayToInstants,
  createCalendarEventSchema,
  instantsToAllDayDates,
  updateCalendarEventSchema,
  zonedWallTimeToInstant,
  type CalendarEvent,
} from "@hanabrew/contracts";
import { z } from "zod";
import { addDaysToKey } from "../../../common/dates.js";
import type { CalendarService } from "../../calendar/calendar.service.js";
import { assertDate, formatLocal, parseLocalDateTime } from "./dates.js";
import { ToolError, clip, defineTool, type ToolContext } from "./tool.js";

const id = z.uuid().describe("The event's id, from list_calendar_events");
const localTime = z
  .string()
  .describe(
    "Local time as YYYY-MM-DDTHH:mm (or YYYY-MM-DD for all-day events), in the user's time zone",
  );

function present(event: CalendarEvent, ctx: ToolContext) {
  if (event.allDay) {
    const { startDate, endDate } = instantsToAllDayDates(event.start, event.end);
    return {
      id: event.id,
      title: event.title,
      allDay: true,
      startDate,
      endDate,
      category: event.category,
      description: clip(event.description),
    };
  }
  return {
    id: event.id,
    title: event.title,
    allDay: false,
    start: formatLocal(event.start, ctx.timeZone),
    end: formatLocal(event.end, ctx.timeZone),
    category: event.category,
    description: clip(event.description),
  };
}

export function calendarTools(calendar: CalendarService) {
  return [
    defineTool({
      name: "list_calendar_events",
      description:
        "List calendar events between two dates (inclusive, local dates), up to 100 days apart.",
      risk: "read",
      input: z.object({
        from: z.string().describe("First day, YYYY-MM-DD"),
        to: z.string().describe("Last day, YYYY-MM-DD"),
      }),
      summarize: (a) => `Look at the calendar from ${a.from} to ${a.to}`,
      async execute(a, ctx) {
        assertDate(a.from, "from");
        assertDate(a.to, "to");
        const [y1, m1, d1] = a.from.split("-").map(Number) as [number, number, number];
        const endKey = addDaysToKey(a.to, 1);
        const [y2, m2, d2] = endKey.split("-").map(Number) as [number, number, number];
        const range = {
          from: zonedWallTimeToInstant(
            { year: y1, month: m1, day: d1 },
            ctx.timeZone,
          ).toISOString(),
          to: zonedWallTimeToInstant({ year: y2, month: m2, day: d2 }, ctx.timeZone).toISOString(),
        };
        const events = (await calendar.list(ctx.workspaceId, createRange(range))).slice(0, 40);
        return {
          data: {
            count: events.length,
            timeZone: ctx.timeZone,
            events: events.map((e) => present(e, ctx)),
          },
          outcome: `Found ${events.length} event${events.length === 1 ? "" : "s"}`,
        };
      },
    }),

    defineTool({
      name: "create_calendar_event",
      description:
        "Create a calendar event. For a timed event give a local start (YYYY-MM-DDTHH:mm) and either an end or durationMinutes (default 60). For an all-day event set allDay and give dates as YYYY-MM-DD (end is the last day, default the same day).",
      risk: "write",
      input: z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        category: z.string().max(30).optional(),
        allDay: z.boolean().optional(),
        start: localTime,
        end: localTime.optional(),
        durationMinutes: z.number().int().min(5).max(1440).optional(),
      }),
      summarize: (a) =>
        `Add event “${a.title}” ${a.allDay ? `on ${a.start}${a.end && a.end !== a.start ? ` to ${a.end}` : ""} (all day)` : `at ${a.start.replace("T", " ")}${a.end ? ` until ${a.end.replace("T", " ")}` : ""}`}`,
      async execute(a, ctx) {
        const times = a.allDay
          ? allDayToInstants(assertDate(a.start, "start"), assertDate(a.end ?? a.start, "end"))
          : timedRange(a.start, a.end, a.durationMinutes, ctx);
        const created = await calendar.create(
          ctx.workspaceId,
          createCalendarEventSchema.parse({
            title: a.title,
            description: a.description,
            category: a.category,
            allDay: a.allDay ?? false,
            ...times,
            timeZone: ctx.timeZone,
          }),
        );
        return {
          data: { created: present(created, ctx) },
          outcome: `Added event “${created.title}”`,
        };
      },
    }),

    defineTool({
      name: "update_calendar_event",
      description:
        "Change an event (find its id with list_calendar_events). To move it give the new start (and optionally end); the length is kept if you only give start.",
      risk: "write",
      input: z
        .object({
          eventId: id,
          title: z.string().min(1).max(200).optional(),
          description: z.string().max(5000).optional(),
          category: z.string().max(30).optional(),
          start: localTime.optional(),
          end: localTime.optional(),
        })
        .refine(
          (a) => Object.entries(a).some(([k, v]) => k !== "eventId" && v !== undefined),
          "Say what to change.",
        ),
      async summarize(a, ctx) {
        const event = await calendar.get(ctx.workspaceId, a.eventId);
        const changes = [
          a.title && `title → “${a.title}”`,
          a.start && `start → ${a.start.replace("T", " ")}`,
          a.end && `end → ${a.end.replace("T", " ")}`,
          a.category && `category → ${a.category}`,
          a.description !== undefined && "update description",
        ].filter(Boolean);
        return `Update event “${event.title}”: ${changes.join("; ")}`;
      },
      async execute(a, ctx) {
        const existing = await calendar.get(ctx.workspaceId, a.eventId);
        const patch: Record<string, unknown> = {};
        if (a.title !== undefined) patch.title = a.title;
        if (a.description !== undefined) patch.description = a.description;
        if (a.category !== undefined) patch.category = a.category;
        if (a.start !== undefined || a.end !== undefined) {
          if (existing.allDay) {
            const current = instantsToAllDayDates(existing.start, existing.end);
            const times = allDayToInstants(
              assertDate(a.start ?? current.startDate, "start"),
              assertDate(a.end ?? (a.start && !a.end ? a.start : current.endDate), "end"),
            );
            patch.start = times.start;
            patch.end = times.end;
          } else {
            const lengthMs = new Date(existing.end).getTime() - new Date(existing.start).getTime();
            const start = a.start
              ? parseLocalDateTime(a.start, ctx.timeZone, "start")
              : new Date(existing.start);
            const end = a.end
              ? parseLocalDateTime(a.end, ctx.timeZone, "end")
              : a.start
                ? new Date(start.getTime() + lengthMs)
                : new Date(existing.end);
            patch.start = start.toISOString();
            patch.end = end.toISOString();
          }
        }
        const updated = await calendar.update(
          ctx.workspaceId,
          a.eventId,
          updateCalendarEventSchema.parse(patch),
        );
        return {
          data: { updated: present(updated, ctx) },
          outcome: `Updated event “${updated.title}”`,
        };
      },
      targetId: (a) => a.eventId,
    }),

    defineTool({
      name: "delete_calendar_event",
      description: "Permanently delete one calendar event. Always needs the user's approval.",
      risk: "destructive",
      input: z.object({ eventId: id }),
      async summarize(a, ctx) {
        return `Delete event “${(await calendar.get(ctx.workspaceId, a.eventId)).title}” permanently`;
      },
      async execute(a, ctx) {
        const event = await calendar.get(ctx.workspaceId, a.eventId);
        await calendar.remove(ctx.workspaceId, a.eventId);
        return { data: { deleted: event.id }, outcome: `Deleted event “${event.title}”` };
      },
      targetId: (a) => a.eventId,
    }),
  ];
}

function timedRange(
  start: string,
  end: string | undefined,
  durationMinutes: number | undefined,
  ctx: ToolContext,
): { start: string; end: string } {
  const startInstant = parseLocalDateTime(start, ctx.timeZone, "start");
  const endInstant = end
    ? parseLocalDateTime(end, ctx.timeZone, "end")
    : new Date(startInstant.getTime() + (durationMinutes ?? 60) * 60_000);
  return { start: startInstant.toISOString(), end: endInstant.toISOString() };
}

function createRange(range: { from: string; to: string }) {
  if (new Date(range.to).getTime() - new Date(range.from).getTime() > 100 * 86_400_000)
    throw new ToolError("Ask for at most 100 days at a time.");
  return range;
}
