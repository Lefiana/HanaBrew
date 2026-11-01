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
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
  uuidSchema,
  type Project,
} from "@hanabrew/contracts";
import type { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import {
  CurrentWorkspace,
  WorkspaceGuard,
  type WorkspaceContext,
} from "../workspaces/workspace-context.js";
import { ProjectsService } from "./projects.service.js";

const idPipe = new ZodValidationPipe(uuidSchema);

@ApiTags("projects")
@ApiCookieAuth()
@UseGuards(WorkspaceGuard)
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query(new ZodValidationPipe(listProjectsQuerySchema))
    query: z.output<typeof listProjectsQuerySchema>,
  ): Promise<Project[]> {
    return this.projects.list(ws.workspaceId, query);
  }

  @Get(":id")
  get(@CurrentWorkspace() ws: WorkspaceContext, @Param("id", idPipe) id: string): Promise<Project> {
    return this.projects.get(ws.workspaceId, id);
  }

  @Post()
  create(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodValidationPipe(createProjectSchema)) body: z.output<typeof createProjectSchema>,
  ): Promise<Project> {
    return this.projects.create(ws.workspaceId, body);
  }

  @Patch(":id")
  update(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: z.output<typeof updateProjectSchema>,
  ): Promise<Project> {
    return this.projects.update(ws.workspaceId, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param("id", idPipe) id: string,
  ): Promise<void> {
    await this.projects.remove(ws.workspaceId, id);
  }
}
