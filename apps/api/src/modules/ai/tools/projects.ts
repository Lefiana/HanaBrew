import { PROJECT_STATUSES, createProjectSchema, type Project } from "@hanabrew/contracts";
import { z } from "zod";
import type { ProjectsService } from "../../projects/projects.service.js";
import { assertDate } from "./dates.js";
import { clip, defineTool } from "./tool.js";

const date = z.string().describe("A date as YYYY-MM-DD");
const brief = (p: Project) => ({
  id: p.id,
  name: p.name,
  status: p.status,
  startDate: p.startDate,
  targetDate: p.targetDate,
  progress: p.progress,
  description: clip(p.description),
});

export function projectTools(projects: ProjectsService) {
  return [
    defineTool({
      name: "list_projects",
      description:
        "List the user's projects with their progress (progress is calculated from real task records).",
      risk: "read",
      input: z.object({ includeArchived: z.boolean().optional() }),
      summarize: () => "List projects",
      async execute(a, ctx) {
        const list = await projects.list(ctx.workspaceId, {
          ...(a.includeArchived ? { includeArchived: true } : {}),
        });
        return {
          data: { count: list.length, projects: list.map(brief) },
          outcome: `Found ${list.length} project${list.length === 1 ? "" : "s"}`,
        };
      },
    }),

    defineTool({
      name: "get_project_progress",
      description:
        "Get one project's progress: how many tasks are done, in progress, to do, and the percent complete.",
      risk: "read",
      input: z.object({ projectId: z.uuid().describe("The project's id, from list_projects") }),
      summarize: () => "Check a project's progress",
      async execute(a, ctx) {
        const project = await projects.get(ctx.workspaceId, a.projectId);
        return { data: brief(project), outcome: `Checked progress of “${project.name}”` };
      },
    }),

    defineTool({
      name: "create_project",
      description: "Create a project. Only the name is required.",
      risk: "write",
      input: z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(5000).optional(),
        status: z
          .enum(
            PROJECT_STATUSES.filter((s) => s !== "ARCHIVED" && s !== "COMPLETED") as [
              string,
              ...string[],
            ],
          )
          .optional(),
        startDate: date.optional(),
        targetDate: date.optional().describe("The project's deadline"),
      }),
      summarize: (a) =>
        `Create project “${a.name}”${a.targetDate ? ` (deadline ${a.targetDate})` : ""}`,
      async execute(a, ctx) {
        if (a.startDate) assertDate(a.startDate, "startDate");
        if (a.targetDate) assertDate(a.targetDate, "targetDate");
        const created = await projects.create(ctx.workspaceId, createProjectSchema.parse({ ...a }));
        return { data: { created: brief(created) }, outcome: `Created project “${created.name}”` };
      },
    }),
  ];
}
