"use client";

import type { Project, Task } from "@hanabrew/contracts";
import { ArchiveRestore, ChevronLeft, FolderArchive, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useTimeZone } from "@/features/settings/use-time-zone";
import { TaskForm } from "@/features/tasks/task-form";
import { localTodayKey } from "@/features/tasks/task-labels";
import { TaskRow } from "@/features/tasks/task-row";
import { useTaskMutations, useTasks } from "@/features/tasks/use-tasks";
import { errorMessageOf } from "@/lib/api-client";
import { formatDateKey } from "@/lib/tz";
import { PROJECT_STATUS_LABELS, ProjectForm } from "./project-form";
import { useProjectMutations, useProjects } from "./use-projects";

type Screen =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "detail"; id: string }
  | { kind: "edit"; id: string };

export function ProjectsApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [showArchived, setShowArchived] = useState(false);
  const projects = useProjects(true); // one list; archived are filtered client-side so detail views keep working
  const all = projects.data ?? [];
  const visible = all.filter((p) => showArchived || p.status !== "ARCHIVED");
  const byId = (id: string) => all.find((p) => p.id === id);

  if (screen.kind === "new") {
    return (
      <ProjectForm
        onDone={(saved) => setScreen(saved ? { kind: "detail", id: saved.id } : { kind: "list" })}
      />
    );
  }
  if (screen.kind === "edit") {
    const project = byId(screen.id);
    if (!project) return <Missing onBack={() => setScreen({ kind: "list" })} />;
    return (
      <ProjectForm project={project} onDone={() => setScreen({ kind: "detail", id: screen.id })} />
    );
  }
  if (screen.kind === "detail") {
    const project = byId(screen.id);
    if (!project)
      return projects.isPending ? (
        <p className="p-4 text-sm text-muted" role="status">
          Loading…
        </p>
      ) : (
        <Missing onBack={() => setScreen({ kind: "list" })} />
      );
    return (
      <ProjectDetail
        project={project}
        onBack={() => setScreen({ kind: "list" })}
        onEdit={() => setScreen({ kind: "edit", id: project.id })}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <h2 className="text-lg font-semibold">Projects</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-[var(--hb-ring)]"
            />
            Show archived
          </label>
          <Button onClick={() => setScreen({ kind: "new" })}>
            <Plus aria-hidden className="size-4" /> New project
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {projects.isPending ? (
          <p className="text-sm text-muted" role="status">
            Loading projects…
          </p>
        ) : projects.isError ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessageOf(projects.error)}
          </p>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted">
            <p className="font-medium text-fg">No projects yet.</p>
            <p className="mt-1">Create one to group related tasks and watch progress build.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" aria-label="Projects">
            {visible.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => setScreen({ kind: "detail", id: project.id })}
                  className="block w-full text-left"
                >
                  <Card className="transition-colors hover:bg-fg/5 motion-reduce:transition-none">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{project.name}</h3>
                      <Badge
                        tone={
                          project.status === "ACTIVE"
                            ? "sage"
                            : project.status === "ARCHIVED"
                              ? "neutral"
                              : "accent"
                        }
                      >
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                    </div>
                    <ProgressBar
                      percent={project.progress.percent}
                      label={`${project.name} progress`}
                      className="mt-3"
                    />
                    <p className="mt-1.5 text-xs text-muted">
                      {project.progress.percent}% · {project.progress.completed} of{" "}
                      {project.progress.total - project.progress.cancelled} tasks done
                      {project.targetDate ? ` · due ${formatDateKey(project.targetDate)}` : ""}
                    </p>
                  </Card>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Missing({ onBack }: { onBack: () => void }) {
  return (
    <div className="p-6 text-sm">
      <p>That project no longer exists.</p>
      <Button variant="outline" className="mt-3" onClick={onBack}>
        Back to projects
      </Button>
    </div>
  );
}

function ProjectDetail({
  project,
  onBack,
  onEdit,
}: {
  project: Project;
  onBack: () => void;
  onEdit: () => void;
}) {
  const { timeZone } = useTimeZone();
  const todayKey = localTodayKey(timeZone);
  const tasks = useTasks({ projectId: project.id, sort: "dueDate", order: "asc" });
  const projects = useProjects(true);
  const { update: updateProject, remove: removeProject } = useProjectMutations();
  const { create, update } = useTaskMutations();
  const [quickTitle, setQuickTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const archived = project.status === "ARCHIVED";
  const p = project.progress;

  if (editingTask) {
    return (
      <TaskForm
        task={editingTask}
        projects={(projects.data ?? []).filter(
          (x) => x.status !== "ARCHIVED" || x.id === project.id,
        )}
        onDone={() => setEditingTask(null)}
      />
    );
  }

  async function addTask(event: FormEvent) {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    setError(null);
    try {
      await create.mutateAsync({ title, projectId: project.id });
      setQuickTitle("");
    } catch (e) {
      setError(errorMessageOf(e));
    }
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessageOf(e));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border p-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-1">
          <ChevronLeft aria-hidden className="size-4" /> Projects
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">{project.name}</h2>
            <p className="mt-0.5 text-sm text-muted">
              <Badge tone={project.status === "ACTIVE" ? "sage" : "accent"}>
                {PROJECT_STATUS_LABELS[project.status]}
              </Badge>
              {project.startDate && (
                <span className="ml-2">from {formatDateKey(project.startDate)}</span>
              )}
              {project.targetDate && (
                <span className="ml-2">due {formatDateKey(project.targetDate)}</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil aria-hidden className="size-4" /> Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={updateProject.isPending}
              onClick={() =>
                void run(() =>
                  updateProject.mutateAsync({
                    id: project.id,
                    patch: { status: archived ? "ACTIVE" : "ARCHIVED" },
                  }),
                )
              }
            >
              {archived ? (
                <>
                  <ArchiveRestore aria-hidden className="size-4" /> Restore
                </>
              ) : (
                <>
                  <FolderArchive aria-hidden className="size-4" /> Archive
                </>
              )}
            </Button>
            {confirmDelete ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={removeProject.isPending}
                  onClick={() =>
                    void run(async () => {
                      await removeProject.mutateAsync(project.id);
                      onBack();
                    })
                  }
                >
                  Delete project
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden className="size-4" /> Delete
              </Button>
            )}
          </div>
        </div>
        {confirmDelete && (
          <p className="mt-2 text-xs text-muted">
            Deleting a project keeps its tasks; they just stop belonging to it.
          </p>
        )}
        {project.description && (
          <p className="mt-3 whitespace-pre-wrap text-sm">{project.description}</p>
        )}

        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{p.percent}% complete</span>
            <span className="text-muted">
              {p.completed} done · {p.inProgress} in progress · {p.todo} to do
              {p.cancelled ? ` · ${p.cancelled} cancelled` : ""}
            </span>
          </div>
          <ProgressBar percent={p.percent} label={`${project.name} progress`} className="mt-1.5" />
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <form onSubmit={addTask} className="mb-3 flex gap-2">
          <Input
            aria-label="Add a task to this project"
            placeholder="Add a task to this project…"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            maxLength={200}
          />
          <Button type="submit" disabled={create.isPending || !quickTitle.trim()}>
            <Plus aria-hidden className="size-4" /> Add
          </Button>
        </form>
        {tasks.isPending ? (
          <p className="text-sm text-muted" role="status">
            Loading tasks…
          </p>
        ) : (tasks.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No tasks in this project yet.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Project tasks">
            {tasks.data!.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                todayKey={todayKey}
                busy={update.isPending}
                onToggle={(t) =>
                  update.mutate({
                    id: t.id,
                    patch: { status: t.status === "COMPLETED" ? "TODO" : "COMPLETED" },
                  })
                }
                onOpen={setEditingTask}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
