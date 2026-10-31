"use client";

import { Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { AppIcon } from "@/features/desktop/app-icons";
import { APPLICATIONS, type DesktopApplication } from "@/features/desktop/app-registry";
import { useUiStore } from "@/stores/ui-store";
import { windowStore } from "@/stores/window-store-instance";

/** Global Ctrl/⌘+K toggles the launcher. */
export function useLauncherShortcut(): void {
  const setOpen = useUiStore((s) => s.setLauncherOpen);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!useUiStore.getState().launcherOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

export function AppLauncher() {
  const open = useUiStore((s) => s.launcherOpen);
  return <AnimatePresence>{open && <LauncherDialog />}</AnimatePresence>;
}

function LauncherDialog() {
  const setOpen = useUiStore((s) => s.setLauncherOpen);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return APPLICATIONS.filter(
      (app) => !q || `${app.name} ${app.description}`.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  function launch(app: DesktopApplication) {
    windowStore.getState().openApp(app);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") setOpen(false);
  }

  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/35 p-4 pt-[12vh] backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}
      onKeyDown={onKeyDown}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="App launcher"
        className="hb-glass w-full max-w-xl rounded-xl p-4 shadow-window"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.18 }}
      >
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            ref={inputRef}
            aria-label="Search apps"
            placeholder="Search apps…"
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results[0]) launch(results[0]);
            }}
          />
        </div>
        {results.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No apps match “{query}”.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {results.map((app) => (
              <li key={app.id}>
                <button
                  type="button"
                  onClick={() => launch(app)}
                  className="flex h-full w-full flex-col items-start gap-1 rounded-lg p-3 text-left transition-colors hover:bg-accent/40 motion-reduce:transition-none"
                >
                  <AppIcon icon={app.icon} className="size-6" />
                  <span className="text-sm font-semibold">{app.name}</span>
                  <span className="text-xs text-muted">{app.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </motion.div>
  );
}
