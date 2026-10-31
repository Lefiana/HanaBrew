"use client";

import { Home } from "lucide-react";
import Link from "next/link";
import { AppIcon } from "@/features/desktop/app-icons";
import { APPLICATIONS } from "@/features/desktop/app-registry";
import { cn } from "@/lib/cn";

export function MobileBottomNav({ currentAppId }: { currentAppId?: string }) {
  const items = APPLICATIONS.filter((app) => app.pinned);
  return (
    <nav
      aria-label="Primary"
      className="hb-glass border-0 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        <NavItem href="/" label="Home" current={currentAppId === undefined}>
          <Home aria-hidden className="size-5" />
        </NavItem>
        {items.map((app) => (
          <NavItem
            key={app.id}
            href={app.route}
            label={app.name.replace(/^Hana/, "")}
            current={currentAppId === app.id}
          >
            <AppIcon icon={app.icon} className="size-5" />
          </NavItem>
        ))}
      </ul>
    </nav>
  );
}

function NavItem({
  href,
  label,
  current,
  children,
}: {
  href: string;
  label: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
          current ? "text-fg" : "text-muted",
        )}
      >
        <span
          className={cn("grid h-7 w-12 place-items-center rounded-full", current && "bg-accent/60")}
        >
          {children}
        </span>
        {label}
      </Link>
    </li>
  );
}
