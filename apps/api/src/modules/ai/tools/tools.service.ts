import { Injectable } from "@nestjs/common";
import { toolParameters, type ToolDefinition } from "@hanabrew/ai-core";
import { CalendarService } from "../../calendar/calendar.service.js";
import { ProjectsService } from "../../projects/projects.service.js";
import { TasksService } from "../../tasks/tasks.service.js";
import { calendarTools } from "./calendar.js";
import { projectTools } from "./projects.js";
import { summaryTool } from "./summary.js";
import { taskTools } from "./tasks.js";
import type { AiTool } from "./tool.js";

/**
 * The complete, fixed list of things Hana can do. Nothing outside this list is reachable: no raw SQL, no
 * workspace or user ids as arguments (they come from the verified session), and every tool goes through the
 * same services, and therefore the same validation and workspace scoping, as the normal API.
 */
@Injectable()
export class AiToolsService {
  private readonly tools: Map<string, AiTool>;

  constructor(tasks: TasksService, projects: ProjectsService, calendar: CalendarService) {
    const all = [
      ...taskTools(tasks, projects),
      ...projectTools(projects),
      ...calendarTools(calendar),
      summaryTool(tasks, projects, calendar),
    ];
    this.tools = new Map(all.map((tool) => [tool.name, tool]));
  }

  get(name: string): AiTool | undefined {
    return this.tools.get(name);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: toolParameters(tool.input),
    }));
  }
}
