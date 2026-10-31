"use client";

import Link from "next/link";
import { ClockWidget } from "@/components/widgets/clock-widget";
import { ThemeToggle } from "@/components/desktop/theme-toggle";
import { SakuraPetals } from "@/components/desktop/sakura-petals";
import { AppIcon } from "@/features/desktop/app-icons";
import { APPLICATIONS } from "@/features/desktop/app-registry";
import { useMe } from "@/features/auth/use-me";
import { MobileBottomNav } from "./mobile-bottom-nav";

/** Small-screen home: a touch-friendly app grid instead of floating windows. */
export function MobileHome() {
  const { data: me } = useMe();
  return (
    <div className="hb-wallpaper relative flex h-dvh flex-col overflow-hidden">
      <SakuraPetals />
      <header className="relative z-10 flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-semibold">HanaBrew</h1>
        <ThemeToggle />
      </header>
      <main className="relative z-10 flex-1 overflow-auto px-4 pb-4">
        <ClockWidget name={me?.user.displayName} />
        <ul className="mt-5 grid grid-cols-2 gap-3">
          {APPLICATIONS.map((app) => (
            <li key={app.id}>
              <Link
                href={app.route}
                className="hb-glass flex min-h-28 flex-col justify-between rounded-xl p-4 shadow-soft active:scale-[0.98]"
              >
                <AppIcon icon={app.icon} className="size-7" />
                <span>
                  <span className="block font-semibold">{app.name}</span>
                  <span className="block text-xs text-muted">{app.description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <div className="relative z-10">
        <MobileBottomNav />
      </div>
    </div>
  );
}
