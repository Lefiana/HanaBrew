import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  createTaskSchema,
  updateTaskSchema,
  type Task,
} from "@hanabrew/contracts";
import { z } from "zod";
import { todayInZone } from "../../../common/dates.js";
import type { ProjectsService } from "../../projects/projects.service.js";
import type { TasksService } from "../../tasks/tasks.service.js";
import { assertDate } from "./dates.js";
import { LOCKED_MESSAGE, ToolError, clip, defineTool, type ToolContext } from "./tool.js";

const date = z.string().describe("A date as YYYY-MM-DD");
const id = (what: string) =>
  z.uuid().describe(`The ${what}'s id, taken from an earlier tool result`);
const tags = z.array(z.string().max(30)).max(10).describe("Short lowercase tags");

const brief = (t: Task) => ({
  id: t.id,
  title: t.title,
  status: t.status,
  priority: t.priority,
  dueDate: t.dueDate,
  projectId: t.projectId,
  tags: t.tags,
  description: clip(t.description),
});

export function taskTools(tasks: TasksService, projects: ProjectsService) {
  const titleOf = async (ctx: ToolContext, taskId: string): Promise<string> =>
    `“${(await tasks.get(ctx.workspaceId, taskId)).title}”`;
  const projectName = async (
    ctx: ToolContext,
    projectId: string | undefined | null,
  ): Promise<string | null> =>
    projectId
      ? ((await projects.get(ctx.workspaceId, projectId).catch(() => null))?.name ?? null)
      : null;

  return [
    defineTool({
      name: "search_tasks",
      description:
        "Find tasks. Use it to look things up, check what's due, or get a task's id before changing it. All filters are optional.",
      risk: "read",
      input: z.object({
        query: z
          .string()
          .max(100)
          .optional()
          .describe("Text to look for in titles and descriptions"),
        status: z.array(z.enum(TASK_STATUSES)).max(4).optional(),
        priority: z.array(z.enum(TASK_PRIORITIES)).max(4).optional(),
        projectId: z.uuid().optional(),
        tag: z.string().max(30).optional(),
        dueFrom: date.optional(),
        dueTo: date.optional(),
        limit: z.number().int().min(1).max(25).default(15),
      }),
      summarize: (a) => `Look up tasks${a.query ? ` matching “${a.query}”` : ""}`,
      async execute(a, ctx) {
        if (a.dueFrom) assertDate(a.dueFrom, "dueFrom");
        if (a.dueTo) assertDate(a.dueTo, "dueTo");
        const found = await tasks.list(ctx.workspaceId, {
          ...(a.query ? { q: a.query } : {}),
          ...(a.status ? { status: a.status } : {}),
          ...(a.priority ? { priority: a.priority } : {}),
          ...(a.projectId ? { projectId: a.projectId } : {}),
          ...(a.tag ? { tag: a.tag.toLowerCase() } : {}),
          ...(a.dueFrom ? { dueFrom: a.dueFrom } : {}),
          ...(a.dueTo ? { dueTo: a.dueTo } : {}),
          sort: "dueDate",
          order: "asc",
          limit: a.limit,
        });
        return {
          data: { count: found.length, tasks: found.map(brief) },
          outcome: `Found ${found.length} task${found.length === 1 ? "" : "s"}`,
        };
      },
    }),

    defineTool({
      name: "get_task_overview",
      description:
        "Get counts of the user's tasks (to do, in progress, completed, overdue, completion percent) and the next few due.",
      risk: "read",
      input: z.object({}),
      summarize: () => "Check the task overview",
      async execute(_a, ctx) {
        const today = todayInZone(ctx.timeZone, ctx.now);
        const [summary, dueSoon] = await Promise.all([
          tasks.summary(ctx.workspaceId, today),
          tasks.dueSoon(ctx.workspaceId, 5),
        ]);
        return {
          data: { today, summary, nextDue: dueSoon.map(brief) },
          outcome: "Checked the task overview",
        };
      },
    }),

    defineTool({
      name: "create_task",
      description: "Create a task. Only the title is required.",
      risk: "write",
      input: z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        dueDate: date.optional(),
        projectId: z.uuid().optional().describe("A project's id, from list_projects"),
        tags: tags.optional(),
        status: z.enum(["TODO", "IN_PROGRESS"]).optional(),
      }),
      async summarize(a, ctx) {
        const project = await projectName(ctx, a.projectId);
        const bits = [
          a.priority && `${a.priority.toLowerCase()} priority`,
          a.dueDate && `due ${a.dueDate}`,
          project && `in “${project}”`,
          a.tags?.length && `tagged ${a.tags.join(", ")}`,
        ].filter(Boolean);
        return `Create task “${a.title}”${bits.length ? ` (${bits.join(", ")})` : ""}`;
      },
      async execute(a, ctx) {
        if (a.dueDate) assertDate(a.dueDate, "dueDate");
        const created = await tasks.create(ctx.workspaceId, createTaskSchema.parse({ ...a }));
        return { data: { created: brief(created) }, outcome: `Created task “${created.title}”` };
      },
      targetId: () => undefined,
    }),

    defineTool({
      name: "update_task",
      description:
        "Change one task (find its id with search_tasks first). Completed tasks are locked and cannot be changed. To remove a due date or project use clearDueDate / clearProject.",
      risk: "write",
      input: z
        .object({
          taskId: id("task"),
          title: z.string().min(1).max(200).optional(),
          description: z.string().max(5000).optional(),
          status: z.enum(TASK_STATUSES).optional(),
          priority: z.enum(TASK_PRIORITIES).optional(),
          dueDate: date.optional(),
          clearDueDate: z.boolean().optional(),
          projectId: z.uuid().optional(),
          clearProject: z.boolean().optional(),
          tags: tags.optional(),
        })
        .refine(
          (a) => Object.entries(a).some(([k, v]) => k !== "taskId" && v !== undefined),
          "Say what to change.",
        ),
      async summarize(a, ctx) {
        const changes = [
          a.title && `title → “${a.title}”`,
          a.status && `status → ${a.status.toLowerCase().replace("_", " ")}`,
          a.priority && `priority → ${a.priority.toLowerCase()}`,
          a.dueDate && `due → ${a.dueDate}`,
          a.clearDueDate && "remove due date",
          a.projectId && "move to another project",
          a.clearProject && "remove from project",
          a.tags && `tags → ${a.tags.join(", ") || "none"}`,
          a.description !== undefined && "update description",
        ].filter(Boolean);
        return `Update task ${await titleOf(ctx, a.taskId)}: ${changes.join("; ")}`;
      },
      async execute(a, ctx) {
        const existing = await tasks.get(ctx.workspaceId, a.taskId);
        if (existing.status === "COMPLETED") throw new ToolError(LOCKED_MESSAGE);
        if (a.dueDate) assertDate(a.dueDate, "dueDate");
        const patch: Record<string, unknown> = {};
        if (a.title !== undefined) patch.title = a.title;
        if (a.description !== undefined) patch.description = a.description;
        if (a.status !== undefined) patch.status = a.status;
        if (a.priority !== undefined) patch.priority = a.priority;
        if (a.clearDueDate) patch.dueDate = null;
        else if (a.dueDate !== undefined) patch.dueDate = a.dueDate;
        if (a.clearProject) patch.projectId = null;
        else if (a.projectId !== undefined) patch.projectId = a.projectId;
        if (a.tags !== undefined) patch.tags = a.tags;
        const updated = await tasks.update(
          ctx.workspaceId,
          a.taskId,
          updateTaskSchema.parse(patch),
        );
        return { data: { updated: brief(updated) }, outcome: `Updated task “${updated.title}”` };
      },
      targetId: (a) => a.taskId,
    }),

    defineTool({
      name: "bulk_update_tasks",
      description:
        "Apply the SAME change to several tasks at once (up to 20), e.g. reschedule or re-prioritise them. Always needs the user's approval. Completed tasks are skipped.",
      risk: "write",
      multiRecord: true,
      input: z.object({
        taskIds: z.array(z.uuid()).min(1).max(20).describe("Ids from search_tasks"),
        patch: z
          .object({
            status: z.enum(TASK_STATUSES).optional(),
            priority: z.enum(TASK_PRIORITIES).optional(),
            dueDate: date.optional(),
            clearDueDate: z.boolean().optional(),
            projectId: z.uuid().optional(),
            clearProject: z.boolean().optional(),
            addTags: tags.optional(),
          })
          .refine((p) => Object.values(p).some((v) => v !== undefined), "Say what to change."),
      }),
      summarize: (a) => {
        const p = a.patch;
        const changes = [
          p.status && `status → ${p.status.toLowerCase().replace("_", " ")}`,
          p.priority && `priority → ${p.priority.toLowerCase()}`,
          p.dueDate && `due → ${p.dueDate}`,
          p.clearDueDate && "remove due date",
          p.projectId && "move to a project",
          p.clearProject && "remove from project",
          p.addTags?.length && `add tags ${p.addTags.join(", ")}`,
        ].filter(Boolean);
        return `Change ${a.taskIds.length} task${a.taskIds.length === 1 ? "" : "s"}: ${changes.join("; ")}`;
      },
      async execute(a, ctx) {
        if (a.patch.dueDate) assertDate(a.patch.dueDate, "dueDate");
        let updated = 0;
        const skipped: Array<{ id: string; reason: string }> = [];
        for (const taskId of new Set(a.taskIds)) {
          try {
            const existing = await tasks.get(ctx.workspaceId, taskId);
            if (existing.status === "COMPLETED") {
              skipped.push({ id: taskId, reason: "completed (locked)" });
              continue;
            }
            const patch: Record<string, unknown> = {};
            if (a.patch.status) patch.status = a.patch.status;
            if (a.patch.priority) patch.priority = a.patch.priority;
            if (a.patch.clearDueDate) patch.dueDate = null;
            else if (a.patch.dueDate) patch.dueDate = a.patch.dueDate;
            if (a.patch.clearProject) patch.projectId = null;
            else if (a.patch.projectId) patch.projectId = a.patch.projectId;
            if (a.patch.addTags?.length)
              patch.tags = [
                ...new Set([...existing.tags, ...a.patch.addTags.map((t) => t.toLowerCase())]),
              ].slice(0, 10);
            await tasks.update(ctx.workspaceId, taskId, updateTaskSchema.parse(patch));
            updated += 1;
          } catch (error) {
            skipped.push({ id: taskId, reason: error instanceof Error ? error.message : "failed" });
          }
        }
        return {
          data: { updated, skipped },
          outcome: `Updated ${updated} task${updated === 1 ? "" : "s"}${skipped.length ? `, skipped ${skipped.length}` : ""}`,
        };
      },
    }),

    defineTool({
      name: "delete_task",
      description: "Permanently delete one task. Always needs the user's approval.",
      risk: "destructive",
      input: z.object({ taskId: id("task") }),
      async summarize(a, ctx) {
        const task = await tasks.get(ctx.workspaceId, a.taskId);
        return `Delete task “${task.title}”${task.status === "COMPLETED" ? " (completed)" : ""} permanently`;
      },
      async execute(a, ctx) {
        const task = await tasks.get(ctx.workspaceId, a.taskId);
        await tasks.remove(ctx.workspaceId, a.taskId);
        return { data: { deleted: task.id }, outcome: `Deleted task “${task.title}”` };
      },
      targetId: (a) => a.taskId,
    }),
  ];
}
