import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  validateEventTimes,
  type CalendarEvent,
  type createCalendarEventSchema,
  type listCalendarEventsQuerySchema,
  type updateCalendarEventSchema,
} from "@hanabrew/contracts";
import type { Prisma, PrismaClient } from "@hanabrew/database";
import type { z } from "zod";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";

type EventRow = Prisma.CalendarEventGetPayload<object>;
type CreateInput = z.output<typeof createCalendarEventSchema>;
type UpdateInput = z.output<typeof updateCalendarEventSchema>;
type ListQuery = z.output<typeof listCalendarEventsQuerySchema>;

const MAX_ROWS = 1000;

export function toEventDto(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    allDay: row.allDay,
    start: row.startsAt.toISOString(),
    end: row.endsAt.toISOString(),
    timeZone: row.timeZone,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): PrismaClient {
    return this.prisma.client;
  }

  /** Events overlapping [from, to): they start before `to` and end after `from`. */
  async list(workspaceId: string, query: ListQuery): Promise<CalendarEvent[]> {
    const rows = await this.db.calendarEvent.findMany({
      where: {
        workspaceId,
        startsAt: { lt: new Date(query.to) },
        endsAt: { gt: new Date(query.from) },
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: MAX_ROWS,
    });
    return rows.map(toEventDto);
  }

  /** Events that haven't finished yet (including ones in progress), soonest first. */
  async upcoming(workspaceId: string, now: Date, limit: number): Promise<CalendarEvent[]> {
    const rows = await this.db.calendarEvent.findMany({
      where: { workspaceId, endsAt: { gt: now } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    return rows.map(toEventDto);
  }

  async get(workspaceId: string, id: string): Promise<CalendarEvent> {
    const row = await this.db.calendarEvent.findFirst({ where: { id, workspaceId } });
    if (!row) throw new NotFoundException("Event not found.");
    return toEventDto(row);
  }

  async create(workspaceId: string, input: CreateInput): Promise<CalendarEvent> {
    const row = await this.db.calendarEvent.create({
      data: {
        workspaceId,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        allDay: input.allDay ?? false,
        startsAt: new Date(input.start),
        endsAt: new Date(input.end),
        timeZone: input.timeZone,
      },
    });
    return toEventDto(row);
  }

  async update(workspaceId: string, id: string, input: UpdateInput): Promise<CalendarEvent> {
    const existing = await this.db.calendarEvent.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException("Event not found.");

    // Validate the merged result, so a partial update can never leave an inconsistent event.
    const merged = {
      allDay: input.allDay ?? existing.allDay,
      start: input.start ?? existing.startsAt.toISOString(),
      end: input.end ?? existing.endsAt.toISOString(),
    };
    const problem = validateEventTimes(merged);
    if (problem) {
      throw new BadRequestException({
        message: "Validation failed.",
        issues: [{ path: "end", message: problem }],
      });
    }

    const data: Prisma.CalendarEventUncheckedUpdateInput = {
      allDay: merged.allDay,
      startsAt: new Date(merged.start),
      endsAt: new Date(merged.end),
    };
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.category !== undefined) data.category = input.category;
    if (input.timeZone !== undefined) data.timeZone = input.timeZone;
    const row = await this.db.calendarEvent.update({ where: { id }, data });
    return toEventDto(row);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const { count } = await this.db.calendarEvent.deleteMany({ where: { id, workspaceId } });
    if (count === 0) throw new NotFoundException("Event not found.");
  }
}
