"use client";

import {
  calendarEventSchema,
  type CreateCalendarEventInput,
  type UpdateCalendarEventInput,
} from "@hanabrew/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, apiSend } from "@/lib/api-client";

export function useEvents(range: { from: string; to: string }) {
  return useQuery({
    queryKey: ["events", range],
    queryFn: () =>
      apiFetch(
        `/api/calendar-events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
        z.array(calendarEventSchema),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useEventMutations() {
  const queryClient = useQueryClient();
  const done = () =>
    Promise.all(
      ["events", "dashboard"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  return {
    create: useMutation({
      mutationFn: (input: CreateCalendarEventInput) =>
        apiSend("POST", "/api/calendar-events", calendarEventSchema, input),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: UpdateCalendarEventInput }) =>
        apiSend("PATCH", `/api/calendar-events/${id}`, calendarEventSchema, patch),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiSend("DELETE", `/api/calendar-events/${id}`, z.undefined()),
      onSuccess: done,
    }),
  };
}
