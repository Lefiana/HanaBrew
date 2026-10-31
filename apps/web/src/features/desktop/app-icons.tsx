import {
  CalendarDays,
  FolderKanban,
  ListChecks,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { AppIconKey } from "./app-registry";

const ICONS: Record<AppIconKey, LucideIcon> = {
  tasks: ListChecks,
  calendar: CalendarDays,
  projects: FolderKanban,
  ai: Sparkles,
  settings: Settings,
};

export function AppIcon({ icon, className }: { icon: AppIconKey; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon aria-hidden className={className} />;
}
