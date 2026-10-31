"use client";

import { AnimatePresence } from "motion/react";
import { useEffect } from "react";
import { APP_COMPONENTS } from "@/features/desktop/app-components";
import { getApplication } from "@/features/desktop/app-registry";
import { windowStore, useWindowStore } from "@/stores/window-store-instance";
import { WindowFrame } from "./window-frame";

/** Renders every open window and keeps the window manager's viewport in sync with the browser. */
export function WindowLayer() {
  const windows = useWindowStore((s) => s.windows);
  const focusedId = useWindowStore((s) => s.focusedId);
  const viewport = useWindowStore((s) => s.viewport);

  useEffect(() => {
    const sync = () =>
      windowStore.getState().setViewport({ width: window.innerWidth, height: window.innerHeight });
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {Object.values(windows)
          .sort((a, b) => a.id.localeCompare(b.id)) // stable DOM order; stacking is by z-index
          .map((win) => {
            const app = getApplication(win.appId);
            const Content = APP_COMPONENTS[win.appId];
            if (!app || !Content) return null;
            return (
              <WindowFrame
                key={win.id}
                win={win}
                app={app}
                active={focusedId === win.id}
                viewport={viewport}
              >
                <Content />
              </WindowFrame>
            );
          })}
      </AnimatePresence>
    </div>
  );
}
