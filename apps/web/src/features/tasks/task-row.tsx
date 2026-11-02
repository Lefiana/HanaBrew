"use client";

import type { Task } from "@hanabrew/contracts";
import { isTaskLocked } from "@hanabrew/contracts";
import { CalendarDays, Lock } from "lucide-react";
import type { MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatDateKey } from "@/lib/tz";
import { PRIORITY_LABELS, STATUS_LABELS } from "./task-labels";

interface TaskRowProps {
  task: Task;
  todayKey: string;
  projectName?: string | undefined;
  busy?: boolean;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  onTagClick?: (tag: string) => void;
}

/** Marks controls inside a row that do their own thing and must not open the task. */
const ROW_ACTION = { "data-row-action": "" } as const;

export function TaskRow({
  task,
  todayKey,
  projectName,
  busy,
  onToggle,
  onOpen,
  onTagClick,
}: TaskRowProps) {
  const locked = isTaskLocked(task);
  const closed = locked || task.status === "CANCELLED";
  const overdue = !closed && task.dueDate !== null && task.dueDate < todayKey;

  // The whole card opens the task. Checkbox and tag chips opt out via data-row-action.
  // (The title is still a real button, so keyboard and screen-reader users have a control to activate;
  // its click bubbles up to this handler.)
  function open(event: MouseEvent<HTMLLIElement>) {
    if ((event.target as HTMLElement).closest("[data-row-action]")) return;
    onOpen(task);
  }

  return (
    <li
      onClick={open}
      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-fg/5 motion-reduce:transition-none"
    >
      <input
        {...ROW_ACTION}
        type="checkbox"
        aria-label={
          locked
            ? `“${task.title}” is completed and locked`
            : task.status === "CANCELLED"
              ? `“${task.title}” is cancelled`
              : `Complete “${task.title}”`
        }
        title={locked ? "Completed tasks are locked. Open the task to reopen it." : undefined}
        checked={locked}
        disabled={busy || closed}
        onChange={() => onToggle(task)}
        className="mt-1 size-4 shrink-0 accent-[var(--hb-ring)] disabled:cursor-not-allowed"
      />
      <div className="min-w-0 flex-1">
        <button type="button" className="block w-full text-left">
          <span
            className={cn(
              "flex items-center gap-1.5 font-medium",
              closed && "text-muted line-through",
            )}
          >
            <span className="truncate">{task.title}</span>
            {locked && <Lock aria-hidden className="size-3.5 shrink-0 no-underline" />}
          </span>
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <Badge
            tone={
              task.priority === "URGENT"
                ? "danger"
                : task.priority === "HIGH"
                  ? "accent"
                  : "neutral"
            }
          >
            {PRIORITY_LABELS[task.priority]}
          </Badge>
          {task.status === "IN_PROGRESS" && <Badge tone="sage">{STATUS_LABELS.IN_PROGRESS}</Badge>}
          {task.status === "CANCELLED" && <Badge>{STATUS_LABELS.CANCELLED}</Badge>}
          {task.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                overdue ? "font-semibold text-danger" : "text-muted",
              )}
            >
              <CalendarDays aria-hidden className="size-3.5" />
              {overdue ? "Overdue · " : ""}
              {formatDateKey(task.dueDate)}
            </span>
          )}
          {projectName && <span className="text-muted">· {projectName}</span>}
          {task.tags.map((tag) => (
            <button
              {...ROW_ACTION}
              key={tag}
              type="button"
              onClick={() => onTagClick?.(tag)}
              className="rounded-full bg-secondary/30 px-2 py-0.5 text-secondary-text hover:bg-secondary/50"
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>
    </li>
  );
}
