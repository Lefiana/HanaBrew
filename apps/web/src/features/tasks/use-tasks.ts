"use client";

import {
  taskSchema,
  taskSummarySchema,
  type CreateTaskInput,
  type TaskPriority,
  type TaskStatus,
  type UpdateTaskInput,
} from "@hanabrew/contracts";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, apiSend } from "@/lib/api-client";

export interface TaskFilters {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  /** A project id, or "none". */
  projectId?: string;
  tag?: string;
  q?: string;
  sort?: "createdAt" | "updatedAt" | "dueDate" | "priority" | "title";
  order?: "asc" | "desc";
}

function toQueryString(filters: TaskFilters): string {
  const params = new URLSearchParams();
  if (filters.status?.length) params.set("status", filters.status.join(","));
  if (filters.priority?.length) params.set("priority", filters.priority.join(","));
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.q) params.set("q", filters.q);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  return params.toString();
}

export function useTasks(filters: TaskFilters) {
  return useQuery({
    queryKey: ["tasks", "list", filters],
    queryFn: () => apiFetch(`/api/tasks?${toQueryString(filters)}`, z.array(taskSchema)),
    placeholderData: keepPreviousData,
  });
}

export function useTaskSummary(timeZone: string) {
  return useQuery({
    queryKey: ["tasks", "summary", timeZone],
    queryFn: () =>
      apiFetch(`/api/tasks/summary?timeZone=${encodeURIComponent(timeZone)}`, taskSummarySchema),
  });
}

/** Task changes also change project progress and the dashboard. */
export function invalidateTaskData(queryClient: QueryClient): Promise<unknown> {
  return Promise.all(
    ["tasks", "projects", "dashboard"].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

export function useTaskMutations() {
  const queryClient = useQueryClient();
  const done = () => invalidateTaskData(queryClient);
  return {
    create: useMutation({
      mutationFn: (input: CreateTaskInput) => apiSend("POST", "/api/tasks", taskSchema, input),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: UpdateTaskInput }) =>
        apiSend("PATCH", `/api/tasks/${id}`, taskSchema, patch),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiSend("DELETE", `/api/tasks/${id}`, z.undefined()),
      onSuccess: done,
    }),
  };
}
