"use client";

import type { Project, Task } from "@hanabrew/contracts";
import { Lock } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTimeZone } from "@/features/settings/use-time-zone";
import { errorMessageOf } from "@/lib/api-client";
import { formatDateKey } from "@/lib/tz";
import { PRIORITY_LABELS } from "./task-labels";
import { useTaskMutations } from "./use-tasks";

/**
 * Read-only view of a completed task. Completed tasks are locked (the API enforces it too):
 * the only way to change one is the explicit, confirmed "Reopen" below.
 */
export function CompletedTaskView({
  task,
  projects,
  onDone,
}: {
  task: Task;
  projects: Project[];
  onDone: () => void;
}) {
  const { timeZone } = useTimeZone();
  const { update, remove } = useTaskMutations();
  const [step, setStep] = useState<"idle" | "reopen" | "delete">("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = update.isPending || remove.isPending;
  const projectName = projects.find((p) => p.id === task.projectId)?.name;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      onDone();
    } catch (e) {
      setError(errorMessageOf(e));
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-lg font-semibold">Completed task</h2>

      <p className="flex items-start gap-2 rounded-md bg-secondary/25 px-3 py-2 text-sm">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          This task is completed, so it’s locked and can’t be edited. Reopen it first if something
          needs to change.
        </span>
      </p>

      <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[8rem_1fr]">
        <Row label="Title">{task.title}</Row>
        {task.description && (
          <Row label="Description">
            <span className="whitespace-pre-wrap">{task.description}</span>
          </Row>
        )}
        <Row label="Priority">{PRIORITY_LABELS[task.priority]}</Row>
        {task.dueDate && (
          <Row label="Due date">
            {formatDateKey(task.dueDate, { year: "numeric", month: "short", day: "numeric" })}
          </Row>
        )}
        {projectName && <Row label="Project">{projectName}</Row>}
        {task.tags.length > 0 && (
          <Row label="Tags">
            <span className="flex flex-wrap gap-1">
              {task.tags.map((tag) => (
                <Badge key={tag}>#{tag}</Badge>
              ))}
            </span>
          </Row>
        )}
        {task.completedAt && (
          <Row label="Completed">
            {new Intl.DateTimeFormat(undefined, {
              timeZone,
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(task.completedAt))}
          </Row>
        )}
      </dl>

      {error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {step === "reopen" ? (
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="font-medium">Reopen this task?</p>
          <p className="mt-1 text-muted">
            It goes back to “To do”, becomes editable again, and any project it belongs to loses
            this task’s progress.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                void run(() => update.mutateAsync({ id: task.id, patch: { status: "TODO" } }))
              }
            >
              Yes, reopen
            </Button>
            <Button variant="ghost" onClick={() => setStep("idle")} disabled={busy}>
              Keep it completed
            </Button>
          </div>
        </div>
      ) : step === "delete" ? (
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="font-medium">Delete this completed task?</p>
          <p className="mt-1 text-muted">
            This can’t be undone, and it will no longer count towards project progress.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void run(() => remove.mutateAsync(task.id))}
            >
              Yes, delete
            </Button>
            <Button variant="ghost" onClick={() => setStep("idle")} disabled={busy}>
              Keep
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onDone}>
            Close
          </Button>
          <Button variant="outline" onClick={() => setStep("reopen")}>
            Reopen task…
          </Button>
          <Button variant="ghost" className="ml-auto" onClick={() => setStep("delete")}>
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
