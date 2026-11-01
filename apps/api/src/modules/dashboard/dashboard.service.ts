import { Injectable } from "@nestjs/common";
import type { Dashboard } from "@hanabrew/contracts";
import { todayInZone } from "../../common/dates.js";
import { CalendarService } from "../calendar/calendar.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { TasksService } from "../tasks/tasks.service.js";

@Injectable()
export class DashboardService {
  constructor(
    private readonly tasks: TasksService,
    private readonly calendar: CalendarService,
    private readonly projects: ProjectsService,
    private readonly settings: SettingsService,
  ) {}

  /** One round trip for every widget; every number is computed from stored records. */
  async get(workspaceId: string, userId: string, requestedZone?: string): Promise<Dashboard> {
    const timeZone = await this.settings.resolveTimeZone(userId, requestedZone);
    const now = new Date();
    const today = todayInZone(timeZone, now);
    const [summary, dueSoon, upcoming, inFlight] = await Promise.all([
      this.tasks.summary(workspaceId, today),
      this.tasks.dueSoon(workspaceId, 5),
      this.calendar.upcoming(workspaceId, now, 5),
      this.projects.inFlight(workspaceId, 4),
    ]);
    return {
      today,
      timeZone,
      tasks: { summary, dueSoon },
      events: { upcoming },
      projects: { inFlight },
    };
  }
}
