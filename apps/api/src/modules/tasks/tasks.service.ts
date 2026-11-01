import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  Task,
  TaskSummary,
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
} from "@hanabrew/contracts";
import { Prisma, type PrismaClient } from "@hanabrew/database";
import type { z } from "zod";
import { formatDateOnly, parseDateOnly } from "../../common/dates.js";
import { percentComplete } from "../../common/progress.js";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { completedAtFor } from "./task-status.js";

type TaskRow = Prisma.TaskGetPayload<object>;
type CreateInput = z.output<typeof createTaskSchema>;
type UpdateInput = z.output<typeof updateTaskSchema>;
type ListQuery = z.output<typeof listTasksQuerySchema>;

export function toTaskDto(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate ? formatDateOnly(row.dueDate) : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    tags: row.tags,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): PrismaClient {
    return this.prisma.client;
  }

  async list(workspaceId: string, query: ListQuery): Promise<Task[]> {
    const where: Prisma.TaskWhereInput = { workspaceId };
    if (query.status) where.status = { in: query.status };
    if (query.priority) where.priority = { in: query.priority };
    if (query.projectId === "none") where.projectId = null;
    else if (query.projectId) where.projectId = query.projectId;
    if (query.tag) where.tags = { has: query.tag };
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
      ];
    }
    if (query.dueFrom || query.dueTo) {
      where.dueDate = {
        ...(query.dueFrom ? { gte: parseDateOnly(query.dueFrom) } : {}),
        ...(query.dueTo ? { lte: parseDateOnly(query.dueTo) } : {}),
      };
    }

    // Enum order in the schema is LOW < MEDIUM < HIGH < URGENT, so sorting by priority desc puts urgent first.
    const primary: Prisma.TaskOrderByWithRelationInput =
      query.sort === "dueDate"
        ? { dueDate: { sort: query.order, nulls: "last" } }
        : { [query.sort]: query.order };
    const rows = await this.db.task.findMany({
      where,
      orderBy: [primary, { id: "asc" }],
      take: query.limit,
    });
    return rows.map(toTaskDto);
  }

  async summary(workspaceId: string, today: string): Promise<TaskSummary> {
    const [groups, overdue] = await Promise.all([
      this.db.task.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }),
      this.db.task.count({
        where: {
          workspaceId,
          status: { in: ["TODO", "IN_PROGRESS"] },
          dueDate: { lt: parseDateOnly(today) },
        },
      }),
    ]);
    const count = (status: string) => groups.find((g) => g.status === status)?._count._all ?? 0;
    const todo = count("TODO");
    const inProgress = count("IN_PROGRESS");
    const completed = count("COMPLETED");
    const cancelled = count("CANCELLED");
    const total = todo + inProgress + completed + cancelled;
    return {
      todo,
      inProgress,
      completed,
      cancelled,
      total,
      overdue,
      completionPercent: percentComplete({ completed, total, cancelled }),
    };
  }

  /** Open tasks with a due date, soonest (and most overdue) first. */
  async dueSoon(workspaceId: string, limit: number): Promise<Task[]> {
    const rows = await this.db.task.findMany({
      where: { workspaceId, status: { in: ["TODO", "IN_PROGRESS"] }, dueDate: { not: null } },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { id: "asc" }],
      take: limit,
    });
    return rows.map(toTaskDto);
  }

  async get(workspaceId: string, id: string): Promise<Task> {
    const row = await this.db.task.findFirst({ where: { id, workspaceId } });
    if (!row) throw new NotFoundException("Task not found.");
    return toTaskDto(row);
  }

  async create(workspaceId: string, input: CreateInput): Promise<Task> {
    if (input.projectId) await this.assertProjectInWorkspace(workspaceId, input.projectId);
    const status = input.status ?? "TODO";
    const row = await this.db.task.create({
      data: {
        workspaceId,
        title: input.title,
        description: input.description ?? null,
        status,
        priority: input.priority ?? "MEDIUM",
        dueDate: input.dueDate ? parseDateOnly(input.dueDate) : null,
        projectId: input.projectId ?? null,
        tags: input.tags ?? [],
        completedAt: completedAtFor(status, null, new Date()),
      },
    });
    return toTaskDto(row);
  }

  async update(workspaceId: string, id: string, input: UpdateInput): Promise<Task> {
    const existing = await this.db.task.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException("Task not found.");
    if (input.projectId) await this.assertProjectInWorkspace(workspaceId, input.projectId);

    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.dueDate !== undefined)
      data.dueDate = input.dueDate ? parseDateOnly(input.dueDate) : null;
    if (input.projectId !== undefined) data.projectId = input.projectId;
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.status !== undefined) {
      data.status = input.status;
      data.completedAt = completedAtFor(input.status, existing, new Date());
    }
    // `id` is a primary key that cannot change workspace, and ownership was verified above.
    const row = await this.db.task.update({ where: { id }, data });
    return toTaskDto(row);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const { count } = await this.db.task.deleteMany({ where: { id, workspaceId } });
    if (count === 0) throw new NotFoundException("Task not found.");
  }

  private async assertProjectInWorkspace(workspaceId: string, projectId: string): Promise<void> {
    const found = await this.db.project.count({ where: { id: projectId, workspaceId } });
    if (found === 0) throw new NotFoundException("Project not found.");
  }
}
