import type { ComponentType } from "react";
import { PlaceholderApp } from "@/features/placeholder/placeholder-app";
import { SettingsApp } from "@/features/settings/settings-app";

/**
 * Maps registry ids to the component each app renders. The same component is used in a
 * floating window and on the full-page route (/apps/[appId]).
 */
export const APP_COMPONENTS: Record<string, ComponentType> = {
  tasks: () => (
    <PlaceholderApp
      name="HanaTasks"
      milestone="M2"
      summary="Create, prioritise and complete tasks with due dates and tags."
      planned={[
        "Statuses and priorities",
        "Due dates and descriptions",
        "Filtering, sorting and progress",
      ]}
    />
  ),
  calendar: () => (
    <PlaceholderApp
      name="HanaCalendar"
      milestone="M2"
      summary="Month, week and day views with time-zone-aware events."
      planned={["Monthly, weekly and daily views", "All-day and timed events", "Event categories"]}
    />
  ),
  projects: () => (
    <PlaceholderApp
      name="HanaProjects"
      milestone="M2"
      summary="Organise tasks into projects with progress calculated from real records."
      planned={["Project status and dates", "Linked tasks", "Progress from actual task data"]}
    />
  ),
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
