"use client";

import { meResponseSchema, type MeResponse } from "@hanabrew/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

export const ME_QUERY_KEY = ["me"] as const;

export function useMe() {
  return useQuery<MeResponse, ApiRequestError>({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiFetch("/api/me", meResponseSchema),
    retry: (failureCount, error) =>
      !(error instanceof ApiRequestError && error.isUnauthorized) && failureCount < 1,
  });
}
