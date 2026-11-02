"use client";

import { calendarDeadlinesSchema } from "@hanabrew/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

/** Task due dates and project target dates between two date keys (inclusive). */
export function useDeadlines(range: { from: string; to: string }) {
  return useQuery({
    queryKey: ["deadlines", range],
    queryFn: () =>
      apiFetch(
        `/api/calendar-deadlines?from=${range.from}&to=${range.to}`,
        calendarDeadlinesSchema,
      ),
    placeholderData: keepPreviousData,
  });
}
