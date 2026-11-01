import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { dashboardQuerySchema, type Dashboard } from "@hanabrew/contracts";
import type { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import {
  CurrentWorkspace,
  WorkspaceGuard,
  type WorkspaceContext,
} from "../workspaces/workspace-context.js";
import { DashboardService } from "./dashboard.service.js";

@ApiTags("dashboard")
@ApiCookieAuth()
@UseGuards(WorkspaceGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query(new ZodValidationPipe(dashboardQuerySchema))
    query: z.output<typeof dashboardQuerySchema>,
  ): Promise<Dashboard> {
    return this.dashboard.get(ws.workspaceId, ws.userId, query.timeZone);
  }
}
