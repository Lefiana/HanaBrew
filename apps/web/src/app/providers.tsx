"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState, type ReactNode } from "react";
import { useUiStore } from "@/stores/ui-store";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
      }),
  );
  const motion = useUiStore((s) => s.motion);
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion={motion === "reduced" ? "always" : "user"}>
        {children}
      </MotionConfig>
    </QueryClientProvider>
  );
}
