"use client";

import { TASK_PRIORITIES, type Task, type TaskPriority } from "@hanabrew/contracts";
import { ArrowDownUp, Plus, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Select } from "@/components/ui/select";
import { useDebounced } from "@/hooks/use-debounced";
import { useProjects } from "@/features/projects/use-projects";
import { useTimeZone } from "@/features/settings/use-time-zone";
import { errorMessageOf } from "@/lib/api-client";
import { PRIORITY_LABELS, localTodayKey } from "./task-labels";
import { TaskForm } from "./task-form";
import { TaskRow } from "./task-row";
import { useTaskMutations, useTasks, useTaskSummary, type TaskFilters } from "./use-tasks";

type View = "active" | "all" | "completed" | "cancelled";
const VIEWS: Array<{ id: View; label: string }> = [
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];
const VIEW_STATUS: Record<View, TaskFilters["status"]> = {
  active: ["TODO", "IN_PROGRESS"],
  completed: ["COMPLETED"],
  cancelled: ["CANCELLED"],
  all: undefined,
};
const SORTS: Array<{ id: NonNullable<TaskFilters["sort"]>; label: string }> = [
  { id: "createdAt", label: "Newest" },
  { id: "dueDate", label: "Due date" },
  { id: "priority", label: "Priority" },
  { id: "title", label: "Title" },
  { id: "updatedAt", label: "Recently updated" },
];

type Editing = { kind: "new" } | { kind: "edit"; task: Task } | null;

export function TasksApp() {
  const { timeZone } = useTimeZone();
  const todayKey = localTodayKey(timeZone);

  const [view, setView] = useState<View>("active");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [projectId, setProjectId] = useState("");
  const [tag, setTag] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<NonNullable<TaskFilters["sort"]>>("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [editing, setEditing] = useState<Editing>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);

  const q = useDebounced(search.trim());
  const filters: TaskFilters = {
    ...(VIEW_STATUS[view] ? { status: VIEW_STATUS[view] } : {}),
    ...(priority ? { priority: [priority] } : {}),
    ...(projectId ? { projectId } : {}),
    ...(tag ? { tag } : {}),
    ...(q ? { q } : {}),
    sort,
    order,
  };

  const tasks = useTasks(filters);
  const summary = useTaskSummary(timeZone);
  const projects = useProjects(true);
  const { create, update } = useTaskMutations();
  const projectNames = useMemo(
    () => new Map((projects.data ?? []).map((p) => [p.id, p.name])),
    [projects.data],
  );

  async function onQuickAdd(event: FormEvent) {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    setQuickError(null);
    try {
      await create.mutateAsync({
        title,
        ...(projectId && projectId !== "none" ? { projectId } : {}),
      });
      setQuickTitle("");
    } catch (e) {
      setQuickError(errorMessageOf(e));
    }
  }

  if (editing) {
    return (
      <TaskForm
        task={editing.kind === "edit" ? editing.task : undefined}
        projects={(projects.data ?? []).filter(
          (p) =>
            p.status !== "ARCHIVED" || (editing.kind === "edit" && editing.task.projectId === p.id),
        )}
        defaultProjectId={projectId && projectId !== "none" ? projectId : undefined}
        onDone={() => setEditing(null)}
      />
    );
  }

  const s = summary.data;
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Tasks</h2>
          {s && (
            <p className="text-sm text-muted">
              {s.completed} of {s.total - s.cancelled} done
              {s.overdue > 0 && (
                <Badge tone="danger" className="ml-2">
                  {s.overdue} overdue
                </Badge>
              )}
            </p>
          )}
        </div>
        <ProgressBar
          percent={s?.completionPercent ?? 0}
          label="Overall task completion"
          className="mt-2"
        />

        <form onSubmit={onQuickAdd} className="mt-3 flex gap-2">
          <Input
            aria-label="Quick add a task"
            placeholder="Add a task and press Enter…"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            maxLength={200}
          />
          <Button type="submit" disabled={create.isPending || !quickTitle.trim()}>
            <Plus aria-hidden className="size-4" /> Add
          </Button>
          <Button type="button" variant="outline" onClick={() => setEditing({ kind: "new" })}>
            Details…
          </Button>
        </form>
        {quickError && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {quickError}
          </p>
        )}

        <div role="tablist" aria-label="Task view" className="mt-3 flex flex-wrap gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              type="button"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`rounded-full px-3 py-1 text-sm ${view === v.id ? "bg-accent text-on-accent" : "hover:bg-fg/10"}`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Input
            aria-label="Search tasks"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="col-span-2 lg:col-span-1"
          />
          <Select
            aria-label="Filter by priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority | "")}
          >
            <option value="">Any priority</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">All projects</option>
            <option value="none">No project</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <div className="flex gap-1">
            <Select
              aria-label="Sort by"
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
            >
              {SORTS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              size="icon"
              aria-label={
                order === "asc"
                  ? "Sorted ascending, switch to descending"
                  : "Sorted descending, switch to ascending"
              }
              onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
              className="size-10 shrink-0"
            >
              <ArrowDownUp aria-hidden className="size-4" />
            </Button>
          </div>
        </div>
        {tag && (
          <button
            type="button"
            onClick={() => setTag("")}
            className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary/30 px-2 py-0.5 text-xs text-secondary-text"
          >
            #{tag} <X aria-label="Clear tag filter" className="size-3" />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {tasks.isPending ? (
          <p className="text-sm text-muted" role="status">
            Loading tasks…
          </p>
        ) : tasks.isError ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessageOf(tasks.error)}
          </p>
        ) : tasks.data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted">
            <p className="font-medium text-fg">
              {view === "active" && !q && !tag && !priority && !projectId
                ? "Nothing to do. Enjoy your coffee ☕"
                : "No tasks match these filters."}
            </p>
            <p className="mt-1">Add one above to get started.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Tasks">
            {tasks.data.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                todayKey={todayKey}
                projectName={task.projectId ? projectNames.get(task.projectId) : undefined}
                busy={update.isPending}
                onToggle={(t) =>
                  update.mutate({
                    id: t.id,
                    patch: { status: t.status === "COMPLETED" ? "TODO" : "COMPLETED" },
                  })
                }
                onOpen={(t) => setEditing({ kind: "edit", task: t })}
                onTagClick={setTag}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
