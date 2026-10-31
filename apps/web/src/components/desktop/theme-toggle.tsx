"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_LABELS, useUiStore } from "@/stores/ui-store";

export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const next = theme === "sakura-latte" ? "midnight-blossom" : "sakura-latte";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${THEME_LABELS[next]}`}
      title={`Switch to ${THEME_LABELS[next]}`}
      onClick={() => setTheme(next)}
    >
      {theme === "sakura-latte" ? (
        <Moon aria-hidden className="size-4" />
      ) : (
        <Sun aria-hidden className="size-4" />
      )}
    </Button>
  );
}
