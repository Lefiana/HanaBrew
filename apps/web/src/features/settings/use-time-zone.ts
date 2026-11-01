"use client";

import { userSettingsSchema, type UserSettings } from "@hanabrew/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiSend } from "@/lib/api-client";
import { browserTimeZone } from "@/lib/tz";

const KEY = ["settings"] as const;

/** The zone every time in the UI is rendered in: the saved one, else the browser's. */
export function useTimeZone() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch("/api/settings", userSettingsSchema),
  });
  const save = useMutation({
    mutationFn: (timeZone: string) =>
      apiSend("PATCH", "/api/settings", userSettingsSchema, { timeZone }),
    onSuccess: (data: UserSettings) => {
      queryClient.setQueryData(KEY, data);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const saved = settings.data?.timeZone ?? null;
  return { timeZone: saved ?? browserTimeZone(), saved, isLoading: settings.isPending, save };
}
