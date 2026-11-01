import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import {
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
  uuidSchema,
  type Task,
  type TaskSummary,
} from "@hanabrew/contracts";
import type { z } from "zod";
import { todayInZone } from "../../common/dates.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import {
  CurrentWorkspace,
  WorkspaceGuard,
  type WorkspaceContext,
} from "../workspaces/workspace-context.js";
import { SettingsService } from "../settings/settings.service.js";
import { TasksService } from "./tasks.service.js";

const idPipe = new ZodValidationPipe(uuidSchema);

@ApiTags("tasks")
@ApiCookieAuth()
@UseGuards(WorkspaceGuard)
@Controller("tasks")
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  list(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query(new ZodValidationPipe(listTasksQuerySchema))
    query: z.output<typeof listTasksQuerySchema>,
  ): Promise<Task[]> {
    return this.tasks.list(ws.workspaceId, query);
  }

  @Get("summary")
  async summary(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query("timeZone") timeZone?: string,
  ): Promise<TaskSummary> {
    const zone = await this.settings.resolveTimeZone(ws.userId, timeZone);
    return this.tasks.summary(ws.workspaceId, todayInZone(zone));
  }

  @Get(":id")
  get(@CurrentWorkspace() ws: WorkspaceContext, @Param("id", idPipe) id: string): Promise<Task> {
    return this.tasks.get(ws.workspaceId, id);
  }

  @Post()
  create(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodValidationPipe(createTaskSchema)) body: z.output<typeof createTaskSchema>,
  ): Promise<Task> {
    return this.tasks.create(ws.workspaceId, body);
  }

  @Patch(":id")
  update(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: z.output<typeof updateTaskSchema>,
  ): Promise<Task> {
    return this.tasks.update(ws.workspaceId, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param("id", idPipe) id: string,
  ): Promise<void> {
    await this.tasks.remove(ws.workspaceId, id);
  }
}
