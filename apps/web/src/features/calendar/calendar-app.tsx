"use client";

import type { CalendarEvent, Project, Task } from "@hanabrew/contracts";
import { Check, ChevronLeft, ChevronRight, Flag, ListChecks, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/features/projects/project-form";
import { useProjects } from "@/features/projects/use-projects";
import { useTimeZone } from "@/features/settings/use-time-zone";
import { TaskForm } from "@/features/tasks/task-form";
import { errorMessageOf } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatDateKey, formatTime, zonedDateKey, zonedParts } from "@/lib/tz";
import {
  deadlinesForDay,
  eventsForDay,
  layoutDay,
  monthGrid,
  navigate,
  viewRange,
  visibleKeys,
  weekKeys,
  type CalendarView,
} from "./calendar-layout";
import { EventForm } from "./event-form";
import { useDeadlines } from "./use-deadlines";
import { useEvents } from "./use-events";

const HOUR_PX = 48;
const VIEWS: Array<{ id: CalendarView; label: string }> = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];

type Editing =
  | { kind: "new"; date: string; hour?: number | undefined }
  | { kind: "edit"; event: CalendarEvent }
  | { kind: "task"; task: Task }
  | { kind: "project"; project: Project }
  | null;

/** One entry in a day cell or the all-day row. */
type DayItem =
  | { kind: "event"; event: CalendarEvent }
  | { kind: "task"; task: Task }
  | { kind: "project"; project: Project };

interface Openers {
  onOpenEvent: (event: CalendarEvent) => void;
  onOpenTask: (task: Task) => void;
  onOpenProject: (project: Project) => void;
}

function titleFor(view: CalendarView, anchor: string): string {
  if (view === "month") return formatDateKey(anchor, { month: "long", year: "numeric" });
  if (view === "day")
    return formatDateKey(anchor, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  const keys = weekKeys(anchor);
  return `${formatDateKey(keys[0]!)} – ${formatDateKey(keys[6]!, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function CalendarApp() {
  const { timeZone } = useTimeZone();
  const todayKey = zonedDateKey(new Date(), timeZone);
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(() => zonedDateKey(new Date(), timeZone));
  const [editing, setEditing] = useState<Editing>(null);

  const range = useMemo(() => viewRange(view, anchor, timeZone), [view, anchor, timeZone]);
  const dateRange = useMemo(() => {
    const keys = visibleKeys(view, anchor);
    return { from: keys[0]!, to: keys[keys.length - 1]! };
  }, [view, anchor]);
  const events = useEvents(range);
  const deadlines = useDeadlines(dateRange);
  const projects = useProjects(true);
  const list = events.data ?? [];

  const openers: Openers = {
    onOpenEvent: (event) => setEditing({ kind: "edit", event }),
    onOpenTask: (task) => setEditing({ kind: "task", task }),
    onOpenProject: (project) => setEditing({ kind: "project", project }),
  };

  if (editing) {
    const close = () => setEditing(null);
    if (editing.kind === "task") {
      return (
        <TaskForm
          task={editing.task}
          projects={(projects.data ?? []).filter(
            (p) => p.status !== "ARCHIVED" || p.id === editing.task.projectId,
          )}
          onDone={close}
        />
      );
    }
    if (editing.kind === "project") return <ProjectForm project={editing.project} onDone={close} />;
    return (
      <EventForm
        event={editing.kind === "edit" ? editing.event : undefined}
        defaultDate={editing.kind === "new" ? editing.date : anchor}
        defaultHour={editing.kind === "new" ? editing.hour : undefined}
        timeZone={timeZone}
        onDone={close}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={`Previous ${view}`}
            onClick={() => setAnchor(navigate(view, anchor, -1))}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(todayKey)}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Next ${view}`}
            onClick={() => setAnchor(navigate(view, anchor, 1))}
          >
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </div>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold" aria-live="polite">
          {titleFor(view, anchor)}
        </h2>
        <div role="tablist" aria-label="Calendar view" className="flex rounded-full bg-fg/10 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              type="button"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "rounded-full px-3 py-1 text-sm",
                view === v.id && "bg-accent text-on-accent",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <Button
          onClick={() => setEditing({ kind: "new", date: view === "month" ? todayKey : anchor })}
        >
          <Plus aria-hidden className="size-4" /> Event
        </Button>
      </header>

      <ul
        aria-label="Legend"
        className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-3 py-1.5 text-xs text-muted"
      >
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-accent" /> Event
        </li>
        <li className="flex items-center gap-1.5">
          <ListChecks aria-hidden className="size-3.5" /> Task due
        </li>
        <li className="flex items-center gap-1.5">
          <Flag aria-hidden className="size-3.5" /> Project deadline
        </li>
      </ul>

      {events.isError && (
        <p role="alert" className="px-4 py-2 text-sm text-danger">
          {errorMessageOf(events.error)}
        </p>
      )}
      {deadlines.isError && (
        <p role="alert" className="px-4 py-2 text-sm text-danger">
          Couldn’t load deadlines. {errorMessageOf(deadlines.error)}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {view === "month" ? (
          <MonthView
            anchor={anchor}
            todayKey={todayKey}
            events={list}
            deadlines={deadlines.data}
            timeZone={timeZone}
            {...openers}
            onNewEvent={(date) => setEditing({ kind: "new", date })}
            onOpenDay={(date) => {
              setAnchor(date);
              setView("day");
            }}
          />
        ) : (
          <TimeGrid
            keys={view === "day" ? [anchor] : weekKeys(anchor)}
            todayKey={todayKey}
            events={list}
            deadlines={deadlines.data}
            timeZone={timeZone}
            {...openers}
            onNewEvent={(date, hour) => setEditing({ kind: "new", date, hour })}
          />
        )}
      </div>
    </div>
  );
}

function EventChip({
  event,
  timeZone,
  onOpen,
}: {
  event: CalendarEvent;
  timeZone: string;
  onOpen: (e: CalendarEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      title={event.title}
      className={cn(
        "block w-full truncate rounded px-1.5 py-0.5 text-left text-xs",
        event.allDay ? "bg-secondary text-on-secondary" : "bg-accent text-on-accent",
      )}
    >
      {!event.allDay && (
        <span className="mr-1 opacity-80">{formatTime(event.start, timeZone)}</span>
      )}
      {event.title}
    </button>
  );
}

function TaskDeadlineChip({ task, onOpen }: { task: Task; onOpen: (t: Task) => void }) {
  const done = task.status === "COMPLETED";
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      title={`Task due: ${task.title}${done ? " (completed)" : ""}`}
      aria-label={`Task due: ${task.title}${done ? " (completed)" : ""}`}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded border border-secondary bg-surface px-1.5 py-0.5 text-left text-xs",
        done && "text-muted line-through",
      )}
    >
      {done ? (
        <Check aria-hidden className="size-3 shrink-0" />
      ) : (
        <ListChecks aria-hidden className="size-3 shrink-0" />
      )}
      <span className="truncate">{task.title}</span>
    </button>
  );
}

function ProjectDeadlineChip({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: (p: Project) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(project)}
      title={`Project deadline: ${project.name}`}
      aria-label={`Project deadline: ${project.name}`}
      className="flex w-full items-center gap-1 truncate rounded border border-accent bg-accent/25 px-1.5 py-0.5 text-left text-xs font-medium"
    >
      <Flag aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{project.name}</span>
    </button>
  );
}

function ItemChip({
  item,
  timeZone,
  onOpenEvent,
  onOpenTask,
  onOpenProject,
}: { item: DayItem; timeZone: string } & Openers) {
  if (item.kind === "event")
    return <EventChip event={item.event} timeZone={timeZone} onOpen={onOpenEvent} />;
  if (item.kind === "task") return <TaskDeadlineChip task={item.task} onOpen={onOpenTask} />;
  return <ProjectDeadlineChip project={item.project} onOpen={onOpenProject} />;
}

/** All-day events first, then project and task deadlines (these are all date-only things). */
function dateOnlyItems(
  deadlines: ReturnType<typeof deadlinesForDay>,
  allDay: CalendarEvent[],
): DayItem[] {
  return [
    ...allDay.map((event): DayItem => ({ kind: "event", event })),
    ...deadlines.projects.map((project): DayItem => ({ kind: "project", project })),
    ...deadlines.tasks.map((task): DayItem => ({ kind: "task", task })),
  ];
}

function MonthView({
  anchor,
  todayKey,
  events,
  deadlines,
  timeZone,
  onNewEvent,
  onOpenDay,
  ...openers
}: {
  anchor: string;
  todayKey: string;
  events: CalendarEvent[];
  deadlines: ReturnType<typeof useDeadlines>["data"];
  timeZone: string;
  onNewEvent: (date: string) => void;
  onOpenDay: (date: string) => void;
} & Openers) {
  const weeks = monthGrid(anchor);
  return (
    <div className="flex min-h-full min-w-[34rem] flex-col">
      <div
        className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted"
        aria-hidden
      >
        {weeks[0]!.map((cell) => (
          <div key={cell.key} className="py-1.5">
            {formatDateKey(cell.key, { weekday: "short" })}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-rows-6">
        {weeks.map((week, row) => (
          <div key={row} className="grid grid-cols-7">
            {week.map((cell) => {
              const { allDay, timed } = eventsForDay(events, cell.key, timeZone);
              // Events come first (all-day, then timed); deadline markers follow, so they never crowd out events.
              const day = deadlinesForDay(deadlines, cell.key);
              const items: DayItem[] = [
                ...allDay.map((event): DayItem => ({ kind: "event", event })),
                ...timed.map((event): DayItem => ({ kind: "event", event })),
                ...day.projects.map((project): DayItem => ({ kind: "project", project })),
                ...day.tasks.map((task): DayItem => ({ kind: "task", task })),
              ];
              return (
                <div
                  key={cell.key}
                  onDoubleClick={() => onNewEvent(cell.key)}
                  className={cn(
                    "min-h-20 border-b border-r border-border p-1",
                    !cell.inMonth && "bg-fg/5 text-muted",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onOpenDay(cell.key)}
                    aria-label={`Open ${formatDateKey(cell.key, { weekday: "long", month: "long", day: "numeric" })}`}
                    className={cn(
                      "mb-0.5 grid size-6 place-items-center rounded-full text-xs",
                      cell.key === todayKey && "bg-accent font-semibold text-on-accent",
                    )}
                  >
                    {cell.day}
                  </button>
                  <div className="flex flex-col gap-0.5">
                    {items.slice(0, 3).map((item) => (
                      <ItemChip key={itemKey(item)} item={item} timeZone={timeZone} {...openers} />
                    ))}
                    {items.length > 3 && (
                      <button
                        type="button"
                        onClick={() => onOpenDay(cell.key)}
                        className="text-left text-xs text-muted hover:underline"
                      >
                        +{items.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const itemKey = (item: DayItem): string =>
  item.kind === "event"
    ? `e-${item.event.id}`
    : item.kind === "task"
      ? `t-${item.task.id}`
      : `p-${item.project.id}`;

function TimeGrid({
  keys,
  todayKey,
  events,
  deadlines,
  timeZone,
  onNewEvent,
  ...openers
}: {
  keys: string[];
  todayKey: string;
  events: CalendarEvent[];
  deadlines: ReturnType<typeof useDeadlines>["data"];
  timeZone: string;
  onNewEvent: (date: string, hour: number) => void;
} & Openers) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 7 * HOUR_PX });
  }, [keys.length]);

  const columns = keys.map((key) => {
    const { allDay, timed } = eventsForDay(events, key, timeZone);
    return { key, timed, topItems: dateOnlyItems(deadlinesForDay(deadlines, key), allDay) };
  });
  const hasTopItems = columns.some((c) => c.topItems.length > 0);
  const now = zonedParts(new Date(), timeZone);
  const nowOffset = (now.hour * 60 + now.minute) * (HOUR_PX / 60);
  const template = { gridTemplateColumns: `3.5rem repeat(${keys.length}, minmax(0, 1fr))` };
  const minWidth = keys.length > 1 ? "44rem" : undefined;

  return (
    <div ref={scroller} className="h-full overflow-auto">
      <div style={{ minWidth }}>
        <div className="sticky top-0 z-10 border-b border-border bg-surface">
          <div className="grid" style={template}>
            <div />
            {columns.map(({ key }) => (
              <div key={key} className="py-1.5 text-center text-xs">
                <span className="text-muted">{formatDateKey(key, { weekday: "short" })}</span>{" "}
                <span
                  className={cn(
                    "inline-grid size-6 place-items-center rounded-full font-semibold",
                    key === todayKey && "bg-accent text-on-accent",
                  )}
                >
                  {Number(key.slice(8))}
                </span>
              </div>
            ))}
          </div>
          {hasTopItems && (
            <div className="grid border-t border-border" style={template}>
              <div className="px-1 py-1 text-right text-[10px] text-muted">all-day</div>
              {columns.map(({ key, topItems }) => (
                <div key={key} className="flex flex-col gap-0.5 border-l border-border p-0.5">
                  {topItems.map((item) => (
                    <ItemChip key={itemKey(item)} item={item} timeZone={timeZone} {...openers} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid" style={template}>
          <div>
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="pr-1 text-right text-[10px] text-muted"
                style={{ height: HOUR_PX }}
              >
                {h === 0
                  ? ""
                  : new Intl.DateTimeFormat(undefined, { hour: "numeric", timeZone: "UTC" }).format(
                      new Date(Date.UTC(2000, 0, 1, h)),
                    )}
              </div>
            ))}
          </div>
          {columns.map(({ key, timed }) => (
            <div
              key={key}
              className="relative border-l border-border"
              style={{ height: 24 * HOUR_PX }}
              onClick={(e) => {
                if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.slot) return;
                const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                onNewEvent(key, Math.min(23, Math.max(0, Math.floor(y / HOUR_PX))));
              }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  data-slot="1"
                  className="absolute inset-x-0 border-t border-border/60"
                  style={{ top: h * HOUR_PX, height: HOUR_PX }}
                />
              ))}
              {key === todayKey && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-[5] h-0.5 bg-danger"
                  style={{ top: nowOffset }}
                />
              )}
              {layoutDay(timed, key, timeZone).map(({ event, top, height, column, columns: n }) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => openers.onOpenEvent(event)}
                  title={`${event.title}, ${formatTime(event.start, timeZone)} to ${formatTime(event.end, timeZone)}`}
                  className="absolute z-[2] overflow-hidden rounded border border-surface bg-accent px-1 py-0.5 text-left text-xs text-on-accent"
                  style={{
                    top: top * (HOUR_PX / 60),
                    height: Math.max(height * (HOUR_PX / 60) - 1, 14),
                    left: `${(column / n) * 100}%`,
                    width: `calc(${100 / n}% - 2px)`,
                  }}
                >
                  <span className="block truncate font-medium">{event.title}</span>
                  {height >= 40 && (
                    <span className="block truncate opacity-80">
                      {formatTime(event.start, timeZone)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
