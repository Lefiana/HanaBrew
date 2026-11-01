import type { ComponentType } from "react";
import { CalendarApp } from "@/features/calendar/calendar-app";
import { PlaceholderApp } from "@/features/placeholder/placeholder-app";
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
  ai: () => (
    <PlaceholderApp
      name="HanaAI"
      milestone="M3"
      summary="Chat with Hana, your cozy assistant, through a provider-independent AI layer."
      planned={[
        "Gemini, Groq and Ollama providers",
        "Approved task-creation tools",
        "Hana's chibi companion",
      ]}
    />
  ),
  settings: SettingsApp,
};
