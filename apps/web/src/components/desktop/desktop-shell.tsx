"use client";

import { ClockWidget } from "@/components/widgets/clock-widget";
import { WindowLayer } from "@/components/windows/window-layer";
import { useMe } from "@/features/auth/use-me";
import { useWindowStore } from "@/stores/window-store-instance";
import { AppLauncher, useLauncherShortcut } from "./app-launcher";
import { Dock } from "./dock";
import { SakuraPetals } from "./sakura-petals";
import { TopBar } from "./top-bar";

/** The floating-window desktop used on larger screens. Window logic lives in the window store. */
export function DesktopShell() {
  const { data: me } = useMe();
  const hasWindows = useWindowStore((s) => Object.keys(s.windows).length > 0);
  useLauncherShortcut();

  return (
    <div className="hb-wallpaper relative h-dvh w-screen overflow-hidden">
      <SakuraPetals />
      <TopBar />
      <div className="absolute right-6 top-16 z-0">
        <ClockWidget name={me?.user.displayName} />
      </div>
      {!hasWindows && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted">
          Open an app from the dock, or press Ctrl/⌘ K
        </p>
      )}
      <WindowLayer />
      <Dock />
      <AppLauncher />
    </div>
  );
}
