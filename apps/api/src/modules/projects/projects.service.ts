import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  Project,
  ProjectProgress,
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
} from "@hanabrew/contracts";
import type { Prisma, PrismaClient } from "@hanabrew/database";
import type { z } from "zod";
import { formatDateOnly, parseDateOnly } from "../../common/dates.js";
import { percentComplete } from "../../common/progress.js";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";

type ProjectRow = Prisma.ProjectGetPayload<object>;
type CreateInput = z.output<typeof createProjectSchema>;
type UpdateInput = z.output<typeof updateProjectSchema>;
type ListQuery = z.output<typeof listProjectsQuerySchema>;

const EMPTY_PROGRESS: ProjectProgress = {
  total: 0,
  todo: 0,
  inProgress: 0,
  completed: 0,
  cancelled: 0,
  percent: 0,
};

export function toProjectDto(row: ProjectRow, progress: ProjectProgress): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    startDate: row.startDate ? formatDateOnly(row.startDate) : null,
    targetDate: row.targetDate ? formatDateOnly(row.targetDate) : null,
    progress,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): PrismaClient {
    return this.prisma.client;
  }

  async list(workspaceId: string, query: ListQuery): Promise<Project[]> {
    const where: Prisma.ProjectWhereInput = { workspaceId };
    if (query.status) where.status = { in: query.status };
    else if (!query.includeArchived) where.status = { not: "ARCHIVED" };
    const rows = await this.db.project.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    return this.withProgress(workspaceId, rows);
  }

  /** Projects still in flight (planning or active), for the dashboard. */
  async inFlight(workspaceId: string, limit: number): Promise<Project[]> {
    const rows = await this.db.project.findMany({
      where: { workspaceId, status: { in: ["PLANNING", "ACTIVE"] } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: limit,
    });
    return this.withProgress(workspaceId, rows);
  }

  async get(workspaceId: string, id: string): Promise<Project> {
    const row = await this.db.project.findFirst({ where: { id, workspaceId } });
    if (!row) throw new NotFoundException("Project not found.");
    return (await this.withProgress(workspaceId, [row]))[0]!;
  }

  async create(workspaceId: string, input: CreateInput): Promise<Project> {
    const row = await this.db.project.create({
      data: {
        workspaceId,
        name: input.name,
        description: input.description ?? null,
        status: input.status ?? "PLANNING",
        startDate: input.startDate ? parseDateOnly(input.startDate) : null,
        targetDate: input.targetDate ? parseDateOnly(input.targetDate) : null,
      },
    });
    return toProjectDto(row, EMPTY_PROGRESS);
  }

  async update(workspaceId: string, id: string, input: UpdateInput): Promise<Project> {
    const existing = await this.db.project.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException("Project not found.");

    // The schema checks dates sent together; also check against the stored values.
    const start =
      input.startDate === undefined
        ? existing.startDate
        : input.startDate
          ? parseDateOnly(input.startDate)
          : null;
    const target =
      input.targetDate === undefined
        ? existing.targetDate
        : input.targetDate
          ? parseDateOnly(input.targetDate)
          : null;
    if (start && target && target < start) {
      throw new BadRequestException({
        message: "Validation failed.",
        issues: [
          { path: "targetDate", message: "The target date can't be before the start date." },
        ],
      });
    }

    const data: Prisma.ProjectUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.status !== undefined) data.status = input.status;
    if (input.startDate !== undefined) data.startDate = start;
    if (input.targetDate !== undefined) data.targetDate = target;
    const row = await this.db.project.update({ where: { id }, data });
    return (await this.withProgress(workspaceId, [row]))[0]!;
  }

  /** Deleting a project keeps its tasks (their project link is cleared by the database). */
  async remove(workspaceId: string, id: string): Promise<void> {
    const { count } = await this.db.project.deleteMany({ where: { id, workspaceId } });
    if (count === 0) throw new NotFoundException("Project not found.");
  }

  /** Progress is always calculated from the task records, never stored or invented. */
  private async withProgress(workspaceId: string, rows: ProjectRow[]): Promise<Project[]> {
    if (rows.length === 0) return [];
    const groups = await this.db.task.groupBy({
      by: ["projectId", "status"],
      where: { workspaceId, projectId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    return rows.map((row) => {
      const count = (status: string) =>
        groups.find((g) => g.projectId === row.id && g.status === status)?._count._all ?? 0;
      const todo = count("TODO");
      const inProgress = count("IN_PROGRESS");
      const completed = count("COMPLETED");
      const cancelled = count("CANCELLED");
      const total = todo + inProgress + completed + cancelled;
      return toProjectDto(row, {
        total,
        todo,
        inProgress,
        completed,
        cancelled,
        percent: percentComplete({ completed, total, cancelled }),
      });
    });
  }
}
