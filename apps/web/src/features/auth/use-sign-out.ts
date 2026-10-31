"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { authClient } from "@/lib/auth-client";
import { windowStore } from "@/stores/window-store-instance";

export function useSignOut(): () => Promise<void> {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await authClient.signOut();
    windowStore.getState().reset();
    queryClient.clear();
    router.replace("/sign-in");
  }, [queryClient, router]);
}
