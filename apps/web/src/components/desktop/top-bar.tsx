"use client";

import { Flower2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/use-me";
import { useSignOut } from "@/features/auth/use-sign-out";
import { useNow } from "@/components/widgets/clock-widget";
import { useWindowStore } from "@/stores/window-store-instance";
import { ThemeToggle } from "./theme-toggle";

export function TopBar() {
  const { data: me } = useMe();
  const signOut = useSignOut();
  const now = useNow(30_000);
  const activeTitle = useWindowStore((s) =>
    s.focusedId ? s.windows[s.focusedId]?.title : undefined,
  );

  return (
    <header className="hb-glass absolute inset-x-0 top-0 z-[900] flex h-10 items-center justify-between border-0 border-b px-3 text-sm">
      <div className="flex items-center gap-2 font-semibold">
        <Flower2 aria-hidden className="size-4" />
        <span>HanaBrew</span>
        {activeTitle && (
          <span className="hidden font-normal text-muted sm:inline">· {activeTitle}</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {now && (
          <time
            dateTime={now.toISOString()}
            className="mr-2 hidden tabular-nums text-muted sm:inline"
          >
            {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </time>
        )}
        <ThemeToggle />
        {me && <span className="mx-1 hidden text-muted md:inline">@{me.user.username}</span>}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          title="Sign out"
          onClick={() => void signOut()}
        >
          <LogOut aria-hidden className="size-4" />
        </Button>
      </div>
    </header>
  );
}
