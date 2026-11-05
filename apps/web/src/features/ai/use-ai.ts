"use client";

import {
  aiOverviewSchema,
  aiSettingsSchema,
  chatResponseSchema,
  conversationDetailSchema,
  conversationSummarySchema,
  providerModelsSchema,
  providerStatusSchema,
  providerTestResultSchema,
  recentActionSchema,
  type AiProviderId,
  type ChatResponse,
  type UpdateAiSettingsInput,
  type UpdateProviderInput,
} from "@hanabrew/contracts";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, apiSend } from "@/lib/api-client";

const lower = (provider: AiProviderId) => provider.toLowerCase();

export const useAiOverview = () =>
  useQuery({
    queryKey: ["ai", "overview"],
    queryFn: () => apiFetch("/api/ai/overview", aiOverviewSchema),
  });

export const useConversations = () =>
  useQuery({
    queryKey: ["ai", "conversations"],
    queryFn: () => apiFetch("/api/ai/conversations", z.array(conversationSummarySchema)),
  });

export const useConversation = (id: string | null) =>
  useQuery({
    queryKey: ["ai", "conversation", id],
    queryFn: () => apiFetch(`/api/ai/conversations/${id}`, conversationDetailSchema),
    enabled: id !== null,
  });

export const useRecentActions = (enabled: boolean) =>
  useQuery({
    queryKey: ["ai", "actions"],
    queryFn: () => apiFetch("/api/ai/actions", z.array(recentActionSchema)),
    enabled,
  });

/** Hana may have created, changed or deleted things, so every data view is refreshed after she acts. */
function refreshData(queryClient: QueryClient): Promise<unknown> {
  return Promise.all(
    ["tasks", "projects", "events", "deadlines", "dashboard"].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

export function useChatMutations() {
  const queryClient = useQueryClient();
  const apply = async (response: ChatResponse) => {
    queryClient.setQueryData(["ai", "conversation", response.id], response);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["ai", "conversations"] }),
      queryClient.invalidateQueries({ queryKey: ["ai", "actions"] }),
      refreshData(queryClient),
    ]);
  };
  return {
    send: useMutation({
      mutationFn: (input: { message: string; conversationId: string | null; timeZone: string }) =>
        apiSend("POST", "/api/ai/chat", chatResponseSchema, {
          message: input.message,
          timeZone: input.timeZone,
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        }),
      onSuccess: apply,
    }),
    decide: useMutation({
      mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) =>
        apiSend("POST", `/api/ai/actions/${id}/${decision}`, chatResponseSchema),
      onSuccess: apply,
      // a 409 (already handled / expired) leaves the card stale, so refetch it
      onError: () => queryClient.invalidateQueries({ queryKey: ["ai", "conversation"] }),
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiSend("DELETE", `/api/ai/conversations/${id}`, z.undefined()),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai"] }),
    }),
  };
}

export function useProviderMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ai", "overview"] });
  return {
    save: useMutation({
      mutationFn: ({ provider, input }: { provider: AiProviderId; input: UpdateProviderInput }) =>
        apiSend("PUT", `/api/ai/providers/${lower(provider)}`, providerStatusSchema, input),
      onSuccess: refresh,
    }),
    removeKey: useMutation({
      mutationFn: (provider: AiProviderId) =>
        apiSend("DELETE", `/api/ai/providers/${lower(provider)}/key`, providerStatusSchema),
      onSuccess: refresh,
    }),
    test: useMutation({
      mutationFn: (provider: AiProviderId) =>
        apiSend("POST", `/api/ai/providers/${lower(provider)}/test`, providerTestResultSchema),
    }),
    models: useMutation({
      mutationFn: (provider: AiProviderId) =>
        apiFetch(`/api/ai/providers/${lower(provider)}/models`, providerModelsSchema),
    }),
    settings: useMutation({
      mutationFn: (input: UpdateAiSettingsInput) =>
        apiSend("PATCH", "/api/ai/settings", aiSettingsSchema, input),
      onSuccess: refresh,
    }),
  };
}
