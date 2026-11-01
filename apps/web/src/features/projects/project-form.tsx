"use client";

import { PROJECT_STATUSES, type Project, type ProjectStatus } from "@hanabrew/contracts";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessageOf, fieldErrorsOf } from "@/lib/api-client";
import { useProjectMutations } from "./use-projects";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export function ProjectForm({
  project,
  onDone,
}: {
  project?: Project | undefined;
  onDone: (saved?: Project) => void;
}) {
  const { create, update } = useProjectMutations();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "PLANNING");
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [targetDate, setTargetDate] = useState(project?.targetDate ?? "");
  const [error, setError] = useState<unknown>(null);
  const fields = fieldErrorsOf(error);
  const busy = create.isPending || update.isPending;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const body = {
      name,
      description: description.trim() ? description : null,
      status,
      startDate: startDate || null,
      targetDate: targetDate || null,
    };
    try {
      const saved = project
        ? await update.mutateAsync({ id: project.id, patch: body })
        : await create.mutateAsync(body);
      onDone(saved);
    } catch (e) {
      setError(e);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4" noValidate>
      <h2 className="text-lg font-semibold">{project ? "Edit project" : "New project"}</h2>
      <Field id="project-name" label="Name" error={fields.name}>
        <Input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoFocus
          required
        />
      </Field>
      <Field id="project-desc" label="Description" error={fields.description}>
        <Textarea
          id="project-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="project-status" label="Status">
          <Select
            id="project-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="project-start" label="Start date" error={fields.startDate}>
          <Input
            id="project-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field id="project-target" label="Target date" error={fields.targetDate}>
          <Input
            id="project-target"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </Field>
      </div>
      {error != null && Object.keys(fields).length === 0 && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {errorMessageOf(error)}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {project ? "Save changes" : "Create project"}
        </Button>
        <Button type="button" variant="outline" onClick={() => onDone()} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
