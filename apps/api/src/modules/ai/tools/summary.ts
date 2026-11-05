import { instantsToAllDayDates, zonedWallTimeToInstant } from "@hanabrew/contracts";
import { z } from "zod";
import { addDaysToKey, todayInZone, weekdayOfKey } from "../../../common/dates.js";
import type { CalendarService } from "../../calendar/calendar.service.js";
import type { ProjectsService } from "../../projects/projects.service.js";
import type { TasksService } from "../../tasks/tasks.service.js";
import { assertDate } from "./dates.js";
import { defineTool } from "./tool.js";

const startOfDay = (key: string, timeZone: string): Date => {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  return zonedWallTimeToInstant({ year, month, day }, timeZone);
};

/** Monday-based week containing `key`. */
export function mondayOf(key: string): string {
  const offset = (weekdayOfKey(key) + 6) % 7;
  return addDaysToKey(key, -offset);
}

export function summaryTool(
  tasks: TasksService,
  projects: ProjectsService,
  calendar: CalendarService,
) {
  return defineTool({
    name: "generate_weekly_summary",
    description:
      "Get the facts for a weekly review (Monday to Sunday): tasks completed and created, what's overdue, what's due in the next 7 days, events this week, and projects in flight. Every number is calculated from the user's records; you write the narrative.",
    risk: "read",
    input: z.object({
      weekOf: z
        .string()
        .optional()
        .describe("Any date (YYYY-MM-DD) in the week you want; defaults to this week"),
    }),
    summarize: () => "Prepare a weekly summary",
    async execute(a, ctx) {
      const today = todayInZone(ctx.timeZone, ctx.now);
      const monday = mondayOf(a.weekOf ? assertDate(a.weekOf, "weekOf") : today);
      const nextMonday = addDaysToKey(monday, 7);
      const from = startOfDay(monday, ctx.timeZone);
      const to = startOfDay(nextMonday, ctx.timeZone);

      const [completed, created, summary, events, dueSoon, inFlight] = await Promise.all([
        tasks.countCompletedBetween(ctx.workspaceId, from, to),
        tasks.countCreatedBetween(ctx.workspaceId, from, to),
        tasks.summary(ctx.workspaceId, today),
        calendar.list(ctx.workspaceId, { from: from.toISOString(), to: to.toISOString() }),
        tasks.dueBetween(ctx.workspaceId, today, addDaysToKey(today, 7)),
        projects.inFlight(ctx.workspaceId, 5),
      ]);
      const openDueSoon = dueSoon.filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS");
      return {
        data: {
          week: { from: monday, to: addDaysToKey(monday, 6) },
          today,
          tasksCompletedThisWeek: completed,
          tasksCreatedThisWeek: created,
          openTasksNow: summary.todo + summary.inProgress,
          overdueNow: summary.overdue,
          overallCompletionPercent: summary.completionPercent,
          dueInNext7Days: {
            count: openDueSoon.length,
            tasks: openDueSoon
              .slice(0, 8)
              .map((t) => ({ title: t.title, dueDate: t.dueDate, priority: t.priority })),
          },
          eventsThisWeek: events.length,
          allDayEventsThisWeek: events.filter(
            (e) => e.allDay && instantsToAllDayDates(e.start, e.end).startDate >= monday,
          ).length,
          projectsInFlight: inFlight.map((p) => ({
            name: p.name,
            status: p.status,
            percentComplete: p.progress.percent,
            targetDate: p.targetDate,
          })),
        },
        outcome: "Prepared the weekly summary",
      };
    },
  });
}
