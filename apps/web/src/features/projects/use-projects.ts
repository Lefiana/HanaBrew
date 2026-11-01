"use client";

import {
  projectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "@hanabrew/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, apiSend } from "@/lib/api-client";

export function useProjects(includeArchived: boolean) {
  return useQuery({
    queryKey: ["projects", "list", includeArchived],
    queryFn: () =>
      apiFetch(
        `/api/projects${includeArchived ? "?includeArchived=true" : ""}`,
        z.array(projectSchema),
      ),
  });
}

export function useProjectMutations() {
  const queryClient = useQueryClient();
  const done = () =>
    Promise.all(
      ["projects", "tasks", "dashboard"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  return {
    create: useMutation({
      mutationFn: (input: CreateProjectInput) =>
        apiSend("POST", "/api/projects", projectSchema, input),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: UpdateProjectInput }) =>
        apiSend("PATCH", `/api/projects/${id}`, projectSchema, patch),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiSend("DELETE", `/api/projects/${id}`, z.undefined()),
      onSuccess: done,
    }),
  };
}
