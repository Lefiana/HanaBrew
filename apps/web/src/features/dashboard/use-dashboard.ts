"use client";

import { dashboardSchema } from "@hanabrew/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useTimeZone } from "@/features/settings/use-time-zone";

export function useDashboard() {
  const { timeZone } = useTimeZone();
  return useQuery({
    queryKey: ["dashboard", timeZone],
    queryFn: () =>
      apiFetch(`/api/dashboard?timeZone=${encodeURIComponent(timeZone)}`, dashboardSchema),
    refetchInterval: 60_000,
  });
}
