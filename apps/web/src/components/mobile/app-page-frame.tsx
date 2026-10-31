"use client";

import { AppWindow, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/desktop/theme-toggle";
import { Button } from "@/components/ui/button";
import { APP_COMPONENTS } from "@/features/desktop/app-components";
import { getApplication } from "@/features/desktop/app-registry";
import { useIsDesktop } from "@/hooks/use-media-query";
import { windowStore } from "@/stores/window-store-instance";
import { MobileBottomNav } from "./mobile-bottom-nav";

/** Full-page rendering of an app: the mobile experience, and a direct-link route on desktop. */
export function AppPageFrame({ appId }: { appId: string }) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const app = getApplication(appId);
  const Content = APP_COMPONENTS[appId];
  if (!app || !Content) return null;

  return (
    <div className="hb-wallpaper flex h-dvh flex-col">
      <header className="hb-glass flex items-center gap-2 border-0 border-b px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" asChild aria-label="Back to home">
          <Link href="/">
            <ChevronLeft aria-hidden className="size-5" />
          </Link>
        </Button>
        <h1 className="flex-1 truncate text-base font-semibold">{app.name}</h1>
        {isDesktop && app.windowMode === "window" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              windowStore.getState().openApp(app);
              router.push("/");
            }}
          >
            <AppWindow aria-hidden className="size-4" />
            Open as window
          </Button>
        )}
        <ThemeToggle />
      </header>
      <main className="min-h-0 flex-1 overflow-auto bg-surface">
        <Content />
      </main>
      <MobileBottomNav currentAppId={appId} />
    </div>
  );
}
