"use client";

import type { Task } from "@hanabrew/contracts";
import { CalendarDays } from "lucide-react";
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

export function TaskRow({
  task,
  todayKey,
  projectName,
  busy,
  onToggle,
  onOpen,
  onTagClick,
}: TaskRowProps) {
  const closed = task.status === "COMPLETED" || task.status === "CANCELLED";
  const overdue = !closed && task.dueDate !== null && task.dueDate < todayKey;

  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <input
        type="checkbox"
        aria-label={
          task.status === "COMPLETED" ? `Reopen “${task.title}”` : `Complete “${task.title}”`
        }
        checked={task.status === "COMPLETED"}
        disabled={busy || task.status === "CANCELLED"}
        onChange={() => onToggle(task)}
        className="mt-1 size-4 shrink-0 accent-[var(--hb-ring)]"
      />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onOpen(task)} className="block w-full text-left">
          <span className={cn("block truncate font-medium", closed && "text-muted line-through")}>
            {task.title}
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
