import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { updateUserSettingsSchema, type UserSettings } from "@hanabrew/contracts";
import type { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import {
  CurrentWorkspace,
  WorkspaceGuard,
  type WorkspaceContext,
} from "../workspaces/workspace-context.js";
import { SettingsService } from "./settings.service.js";

@ApiTags("settings")
@ApiCookieAuth()
@UseGuards(WorkspaceGuard)
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentWorkspace() ws: WorkspaceContext): Promise<UserSettings> {
    return this.settings.get(ws.userId);
  }

  @Patch()
  update(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodValidationPipe(updateUserSettingsSchema))
    body: z.output<typeof updateUserSettingsSchema>,
  ): Promise<UserSettings> {
    return this.settings.update(ws.userId, body);
  }
}
