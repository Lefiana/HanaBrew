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
  createCalendarEventSchema,
  listCalendarEventsQuerySchema,
  updateCalendarEventSchema,
  uuidSchema,
  type CalendarEvent,
} from "@hanabrew/contracts";
import type { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import {
  CurrentWorkspace,
  WorkspaceGuard,
  type WorkspaceContext,
} from "../workspaces/workspace-context.js";
import { CalendarService } from "./calendar.service.js";

const idPipe = new ZodValidationPipe(uuidSchema);

@ApiTags("calendar")
@ApiCookieAuth()
@UseGuards(WorkspaceGuard)
@Controller("calendar-events")
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  list(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query(new ZodValidationPipe(listCalendarEventsQuerySchema))
    query: z.output<typeof listCalendarEventsQuerySchema>,
  ): Promise<CalendarEvent[]> {
    return this.calendar.list(ws.workspaceId, query);
  }

  @Get(":id")
  get(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param("id", idPipe) id: string,
  ): Promise<CalendarEvent> {
    return this.calendar.get(ws.workspaceId, id);
  }

  @Post()
  create(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodValidationPipe(createCalendarEventSchema))
    body: z.output<typeof createCalendarEventSchema>,
  ): Promise<CalendarEvent> {
    return this.calendar.create(ws.workspaceId, body);
  }

  @Patch(":id")
  update(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(updateCalendarEventSchema))
    body: z.output<typeof updateCalendarEventSchema>,
  ): Promise<CalendarEvent> {
    return this.calendar.update(ws.workspaceId, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param("id", idPipe) id: string,
  ): Promise<void> {
    await this.calendar.remove(ws.workspaceId, id);
  }
}
