import type { ComponentType } from "react";
import { AiApp } from "@/features/ai/ai-app";
import { CalendarApp } from "@/features/calendar/calendar-app";
import { ProjectsApp } from "@/features/projects/projects-app";
import { SettingsApp } from "@/features/settings/settings-app";
import { TasksApp } from "@/features/tasks/tasks-app";

/**
 * Maps registry ids to the component each app renders. The same component is used in a
 * floating window and on the full-page route (/apps/[appId]).
 */
export const APP_COMPONENTS: Record<string, ComponentType> = {
  tasks: TasksApp,
  calendar: CalendarApp,
  projects: ProjectsApp,
  ai: AiApp,
  settings: SettingsApp,
};
