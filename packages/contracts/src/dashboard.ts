import { z } from "zod";
import { isoDateSchema, timeZoneSchema } from "./common.js";
import { calendarEventSchema } from "./calendar.js";
import { projectSchema } from "./projects.js";
import { taskSchema, taskSummarySchema } from "./tasks.js";

export const dashboardQuerySchema = z.object({ timeZone: timeZoneSchema.optional() });

/** Everything the dashboard widgets need, with all metrics calculated by the API. */
export const dashboardSchema = z.object({
  /** "Today" in the requested (or saved) time zone. */
  today: isoDateSchema,
  timeZone: z.string(),
  tasks: z.object({ summary: taskSummarySchema, dueSoon: z.array(taskSchema) }),
  events: z.object({ upcoming: z.array(calendarEventSchema) }),
  /** Projects still in flight (planning or active), most recently updated first. */
  projects: z.object({ inFlight: z.array(projectSchema) }),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
