import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { listCalendarDeadlinesQuerySchema, type CalendarDeadlines } from "@hanabrew/contracts";
import type { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { ProjectsService } from "../projects/projects.service.js";
import { TasksService } from "../tasks/tasks.service.js";
import {
  CurrentWorkspace,
  WorkspaceGuard,
  type WorkspaceContext,
} from "../workspaces/workspace-context.js";

@ApiTags("calendar")
@ApiCookieAuth()
@UseGuards(WorkspaceGuard)
@Controller("calendar-deadlines")
export class DeadlinesController {
  constructor(
    private readonly tasks: TasksService,
    private readonly projects: ProjectsService,
  ) {}

  /** Task due dates and project target dates for the calendar, scoped to the caller's workspace. */
  @Get()
  async list(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query(new ZodValidationPipe(listCalendarDeadlinesQuerySchema))
    query: z.output<typeof listCalendarDeadlinesQuerySchema>,
  ): Promise<CalendarDeadlines> {
    const [tasks, projects] = await Promise.all([
      this.tasks.dueBetween(ws.workspaceId, query.from, query.to),
      this.projects.targetBetween(ws.workspaceId, query.from, query.to),
    ]);
    return { tasks, projects };
  }
}
