"use client";

import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Project,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@hanabrew/contracts";
import { isTaskLocked } from "@hanabrew/contracts";
import { useState, type FormEvent } from "react";
import { CompletedTaskView } from "./completed-task-view";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessageOf, fieldErrorsOf } from "@/lib/api-client";
import { PRIORITY_LABELS, STATUS_LABELS } from "./task-labels";
import { useTaskMutations } from "./use-tasks";

interface TaskFormProps {
  task?: Task | undefined;
  projects: Project[];
  defaultProjectId?: string | undefined;
  onDone: () => void;
}

const parseTags = (raw: string): string[] =>
  raw
    .split(/[,\s]+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean);

export function TaskForm(props: TaskFormProps) {
  // Completed tasks are locked: show them read-only (with an explicit Reopen) instead of the editor.
  if (props.task && isTaskLocked(props.task)) {
    return <CompletedTaskView task={props.task} projects={props.projects} onDone={props.onDone} />;
  }
  return <TaskEditor {...props} />;
}

function TaskEditor({ task, projects, defaultProjectId, onDone }: TaskFormProps) {
  const { create, update, remove } = useTaskMutations();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "TODO");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "MEDIUM");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [projectId, setProjectId] = useState(task?.projectId ?? defaultProjectId ?? "");
  const [tags, setTags] = useState(task?.tags.join(", ") ?? "");
  const [error, setError] = useState<unknown>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = create.isPending || update.isPending || remove.isPending;
  const fields = fieldErrorsOf(error);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const common = {
      title,
      description: description.trim() ? description : null,
      status,
      priority,
      dueDate: dueDate || null,
      projectId: projectId || null,
      tags: parseTags(tags),
    };
    try {
      if (task) await update.mutateAsync({ id: task.id, patch: common });
      else await create.mutateAsync(common);
      onDone();
    } catch (e) {
      setError(e);
    }
  }

  async function onDelete() {
    if (!task) return;
    try {
      await remove.mutateAsync(task.id);
      onDone();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4" noValidate>
      <h2 className="text-lg font-semibold">{task ? "Edit task" : "New task"}</h2>
      <Field id="task-title" label="Title" error={fields.title}>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          autoFocus
          required
        />
      </Field>
      <Field id="task-desc" label="Description" error={fields.description}>
        <Textarea
          id="task-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="task-status"
          label="Status"
          hint={
            status === "CANCELLED"
              ? "Cancelled tasks don't count towards project progress."
              : status === "COMPLETED"
                ? "Once completed, a task is locked until you reopen it."
                : undefined
          }
        >
          <Select
            id="task-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="task-priority" label="Priority">
          <Select
            id="task-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="task-due" label="Due date" error={fields.dueDate}>
          <Input
            id="task-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
        <Field id="task-project" label="Project" error={fields.projectId}>
          <Select
            id="task-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        id="task-tags"
        label="Tags"
        hint="Separate with commas or spaces. Up to 10."
        error={fields.tags}
      >
        <Input
          id="task-tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="work, errand"
        />
      </Field>

      {error != null && Object.keys(fields).length === 0 && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {errorMessageOf(error)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy}>
          {task ? "Save changes" : "Add task"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        {task && (
          <span className="ml-auto flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-sm text-muted">Delete this task?</span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => void onDelete()}
                  disabled={busy}
                >
                  Yes, delete
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
          </span>
        )}
      </div>
    </form>
  );
}
