"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useIsDesktop } from "@/hooks/use-media-query";
import { windowStore } from "@/stores/window-store-instance";
import { getApplication } from "./app-registry";

/** Opens an app as a window on the desktop, or navigates to its full-page route on small screens. */
export function useOpenApp(): (appId: string) => void {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  return useCallback(
    (appId: string) => {
      const app = getApplication(appId);
      if (!app) return;
      if (isDesktop) windowStore.getState().openApp(app);
      else router.push(app.route);
    },
    [isDesktop, router],
  );
}
