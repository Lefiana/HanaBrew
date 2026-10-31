import { useStore } from "zustand";
import { createWindowStore, type WindowStoreState } from "@/features/desktop/window-store";

/** The single desktop window manager for the browser session. */
export const windowStore = createWindowStore();

export function useWindowStore<T>(selector: (state: WindowStoreState) => T): T {
  return useStore(windowStore, selector);
}
