"use client";

import type { Dashboard } from "@hanabrew/contracts";
import { instantsToAllDayDates } from "@hanabrew/contracts";
import { CalendarDays, FolderKanban, ListChecks } from "lucide-react";
import type { ReactNode } from "react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useOpenApp } from "@/features/desktop/use-open-app";
import { cn } from "@/lib/cn";
import { addDays, formatDateKey, formatTime, zonedDateKey } from "@/lib/tz";
import { useDashboard } from "./use-dashboard";

/** Dashboard cards. Every number shown here is calculated by the API from stored records. */
export function DashboardWidgets({ className }: { className?: string }) {
  const dashboard = useDashboard();

  if (dashboard.isPending) {
    return (
      <div
        className={cn("hb-glass h-24 rounded-xl p-4 text-sm text-muted", className)}
        role="status"
      >
        Loading your day…
      </div>
    );
  }
  if (dashboard.isError) {
    return (
      <div className={cn("hb-glass rounded-xl p-4 text-sm text-muted", className)} role="status">
        Your dashboard is unavailable right now.
      </div>
    );
  }
  const data = dashboard.data;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <TasksCard data={data} />
      <CalendarCard data={data} />
      <ProjectsCard data={data} />
    </div>
  );
}

function CardShell({
  title,
  icon,
  appId,
  children,
}: {
  title: string;
  icon: ReactNode;
  appId: string;
  children: ReactNode;
}) {
  const open = useOpenApp();
  return (
    <section aria-label={title} className="hb-glass rounded-xl p-3 shadow-soft">
      <button
        type="button"
        onClick={() => open(appId)}
        className="mb-2 flex w-full items-center gap-2 text-left text-sm font-semibold hover:underline"
      >
        {icon}
        {title}
      </button>
      {children}
    </section>
  );
}

function Ring({ percent }: { percent: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      viewBox="0 0 48 48"
      className="size-14 shrink-0 -rotate-90"
      role="img"
      aria-label={`${percent}% of tasks complete`}
    >
      <circle cx="24" cy="24" r={radius} fill="none" strokeWidth="5" className="stroke-fg/10" />
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        className="stroke-secondary transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent / 100)}
      />
      <text
        x="24"
        y="24"
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 fill-fg text-[11px] font-semibold"
        transform="rotate(90 24 24)"
      >
        {percent}%
      </text>
    </svg>
  );
}

function TasksCard({ data }: { data: Dashboard }) {
  const { summary, dueSoon } = data.tasks;
  const open = summary.todo + summary.inProgress;
  return (
    <CardShell title="Tasks" icon={<ListChecks aria-hidden className="size-4" />} appId="tasks">
      <div className="flex items-center gap-3">
        <Ring percent={summary.completionPercent} />
        <div className="text-sm">
          <p className="font-medium">{open === 0 ? "All clear" : `${open} to go`}</p>
          <p className="text-xs text-muted">
            {summary.completed} done
            {summary.inProgress ? ` · ${summary.inProgress} in progress` : ""}
          </p>
          {summary.overdue > 0 && (
            <p className="text-xs font-semibold text-danger">{summary.overdue} overdue</p>
          )}
        </div>
      </div>
      {dueSoon.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
          {dueSoon.slice(0, 3).map((task) => (
            <li key={task.id} className="flex justify-between gap-2">
              <span className="truncate">{task.title}</span>
              <span
                className={cn(
                  "shrink-0",
                  task.dueDate! < data.today ? "font-semibold text-danger" : "text-muted",
                )}
              >
                {formatDateKey(task.dueDate!)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function whenLabel(event: Dashboard["events"]["upcoming"][number], data: Dashboard): string {
  if (event.allDay) {
    const { startDate } = instantsToAllDayDates(event.start, event.end);
    return `${relativeDay(startDate < data.today ? data.today : startDate, data.today)} · all day`;
  }
  const start = new Date(event.start);
  const startKey = zonedDateKey(start, data.timeZone);
  // An event already under way shows as "Now"; otherwise its day and time.
  if (start.getTime() <= Date.now()) return "Now";
  return `${relativeDay(startKey, data.today)} · ${formatTime(start, data.timeZone)}`;
}

function relativeDay(key: string, today: string): string {
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  return formatDateKey(key, { weekday: "short", month: "short", day: "numeric" });
}

function CalendarCard({ data }: { data: Dashboard }) {
  const events = data.events.upcoming.slice(0, 3);
  return (
    <CardShell
      title="Coming up"
      icon={<CalendarDays aria-hidden className="size-4" />}
      appId="calendar"
    >
      {events.length === 0 ? (
        <p className="text-xs text-muted">Nothing scheduled.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {events.map((event) => (
            <li key={event.id}>
              <p className="truncate font-medium">{event.title}</p>
              <p className="text-muted">{whenLabel(event, data)}</p>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function ProjectsCard({ data }: { data: Dashboard }) {
  const projects = data.projects.inFlight.slice(0, 3);
  return (
    <CardShell
      title="Projects"
      icon={<FolderKanban aria-hidden className="size-4" />}
      appId="projects"
    >
      {projects.length === 0 ? (
        <p className="text-xs text-muted">No projects in flight.</p>
      ) : (
        <ul className="space-y-2 text-xs">
          {projects.map((project) => (
            <li key={project.id}>
              <div className="flex justify-between gap-2">
                <span className="truncate font-medium">{project.name}</span>
                <span className="text-muted">{project.progress.percent}%</span>
              </div>
              <ProgressBar
                percent={project.progress.percent}
                label={`${project.name} progress`}
                className="mt-1 h-1.5"
              />
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}
