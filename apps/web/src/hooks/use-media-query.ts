"use client";

import { useSyncExternalStore } from "react";

/** `null` until the browser can answer (server render and first hydration pass). */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}

export const DESKTOP_QUERY = "(min-width: 768px)";
export const useIsDesktop = (): boolean | null => useMediaQuery(DESKTOP_QUERY);
