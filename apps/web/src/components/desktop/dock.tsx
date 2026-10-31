"use client";

import { LayoutGrid } from "lucide-react";
import { APPLICATIONS, type DesktopApplication } from "@/features/desktop/app-registry";
import { AppIcon } from "@/features/desktop/app-icons";
import { windowIdFor } from "@/features/desktop/window-store";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/ui-store";
import { useWindowStore, windowStore } from "@/stores/window-store-instance";

/** Dock behaviour: closed → open, minimized → restore, background → focus, focused → minimize. */
function activate(app: DesktopApplication): void {
  const { windows, focusedId, openApp, restoreWindow, focusWindow, minimizeWindow } =
    windowStore.getState();
  const win = windows[windowIdFor(app.id)];
  if (!win) openApp(app);
  else if (win.state === "minimized") restoreWindow(win.id);
  else if (focusedId === win.id) minimizeWindow(win.id);
  else focusWindow(win.id);
}

export function Dock() {
  const windows = useWindowStore((s) => s.windows);
  const focusedId = useWindowStore((s) => s.focusedId);
  const launcherOpen = useUiStore((s) => s.launcherOpen);
  const setLauncherOpen = useUiStore((s) => s.setLauncherOpen);

  // Pinned apps always show; unpinned apps (e.g. Settings) show only while open.
  const apps = APPLICATIONS.filter((app) => app.pinned || windows[windowIdFor(app.id)]);

  return (
    <nav
      aria-label="Dock"
      className="pointer-events-none absolute inset-x-0 bottom-3 z-[900] flex justify-center px-2"
    >
      <ul className="hb-glass pointer-events-auto flex items-end gap-1.5 rounded-xl p-2 shadow-soft">
        <li>
          <DockButton
            label="Open app launcher (Ctrl/⌘ K)"
            pressed={launcherOpen}
            onClick={() => setLauncherOpen(!launcherOpen)}
          >
            <LayoutGrid aria-hidden className="size-6" />
          </DockButton>
        </li>
        <li aria-hidden className="mx-1 h-8 w-px self-center bg-border" />
        {apps.map((app) => {
          const win = windows[windowIdFor(app.id)];
          return (
            <li key={app.id}>
              <DockButton
                label={
                  win
                    ? `${app.name} — ${win.state === "minimized" ? "minimized, click to restore" : "open"}`
                    : `Open ${app.name}`
                }
                pressed={focusedId === win?.id}
                onClick={() => activate(app)}
              >
                <AppIcon icon={app.icon} className="size-6" />
                <span
                  aria-hidden
                  className={cn(
                    "absolute -bottom-0.5 h-1 rounded-full bg-fg transition-all motion-reduce:transition-none",
                    !win && "w-0",
                    win?.state === "minimized" && "w-1.5 opacity-50",
                    win && win.state !== "minimized" && "w-3",
                  )}
                />
              </DockButton>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function DockButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "relative grid size-12 place-items-center rounded-lg transition duration-150 hover:-translate-y-1 hover:bg-accent/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        pressed && "bg-accent/50",
      )}
    >
      {children}
    </button>
  );
}
