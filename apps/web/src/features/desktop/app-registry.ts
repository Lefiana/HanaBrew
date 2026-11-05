/**
 * Central registry of built-in applications. Docks, launchers, window titles, routes and the
 * mobile navigation are all derived from this list, so adding an app means adding one entry
 * here plus its component in app-components.tsx. Third-party installation is out of scope for the MVP.
 */
export interface DesktopApplication {
  id: string;
  name: string;
  description: string;
  /** Key into the icon map (app-icons.tsx); keeps this file free of UI imports. */
  icon: AppIconKey;
  route: string;
  windowMode: "window" | "page" | "panel";
  defaultSize?: { width: number; height: number };
  /** Appears in the dock and mobile bottom navigation. */
  pinned: boolean;
}

export type AppIconKey = "tasks" | "calendar" | "projects" | "ai" | "settings";

export const APPLICATIONS: readonly DesktopApplication[] = [
  {
    id: "tasks",
    name: "HanaTasks",
    description: "Plan and finish your to-dos.",
    icon: "tasks",
    route: "/apps/tasks",
    windowMode: "window",
    defaultSize: { width: 780, height: 540 },
    pinned: true,
  },
  {
    id: "calendar",
    name: "HanaCalendar",
    description: "Your days, weeks and events.",
    icon: "calendar",
    route: "/apps/calendar",
    windowMode: "window",
    defaultSize: { width: 900, height: 580 },
    pinned: true,
  },
  {
    id: "projects",
    name: "HanaProjects",
    description: "Group tasks into projects and track progress.",
    icon: "projects",
    route: "/apps/projects",
    windowMode: "window",
    defaultSize: { width: 820, height: 560 },
    pinned: true,
  },
  {
    id: "ai",
    name: "HanaAI",
    description: "Chat with Hana, your cozy assistant.",
    icon: "ai",
    route: "/apps/ai",
    windowMode: "window",
    defaultSize: { width: 480, height: 640 },
    pinned: true,
  },
  {
    id: "settings",
    name: "Settings",
    description: "Themes, motion and your account.",
    icon: "settings",
    route: "/apps/settings",
    windowMode: "window",
    defaultSize: { width: 560, height: 520 },
    pinned: false,
  },
] as const;

export function getApplication(id: string): DesktopApplication | undefined {
  return APPLICATIONS.find((app) => app.id === id);
}
