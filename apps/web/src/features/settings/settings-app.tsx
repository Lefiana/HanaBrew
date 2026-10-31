"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { useMe } from "@/features/auth/use-me";
import { useSignOut } from "@/features/auth/use-sign-out";
import {
  THEMES,
  THEME_LABELS,
  useUiStore,
  type MotionPreference,
  type Theme,
} from "@/stores/ui-store";

const SWATCHES: Record<Theme, string[]> = {
  "sakura-latte": ["#fffdd0", "#ffb7c5", "#4a2c2a", "#9caf88"],
  "midnight-blossom": ["#15131d", "#ffb7c5", "#f8efd8", "#9caf88"],
};

const MOTION_OPTIONS: Array<{ value: MotionPreference; label: string; hint: string }> = [
  {
    value: "system",
    label: "Follow system",
    hint: "Animations respect your device's reduce-motion setting.",
  },
  { value: "reduced", label: "Reduce motion", hint: "No falling petals or window animations." },
];

export function SettingsApp() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const motion = useUiStore((s) => s.motion);
  const setMotion = useUiStore((s) => s.setMotion);
  const { data: me } = useMe();
  const signOut = useSignOut();

  return (
    <div className="flex flex-col gap-5 p-6">
      <section aria-labelledby="theme-heading">
        <h2 id="theme-heading" className="text-lg font-semibold">
          Theme
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {THEMES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex items-center justify-between rounded-lg border p-4 text-left transition-colors",
                theme === value ? "border-ring bg-accent/25" : "border-border hover:bg-fg/5",
              )}
            >
              <span>
                <span className="block font-medium">{THEME_LABELS[value]}</span>
                <span className="mt-2 flex gap-1.5" aria-hidden>
                  {SWATCHES[value].map((color) => (
                    <span
                      key={color}
                      className="size-5 rounded-full border border-black/10"
                      style={{ background: color }}
                    />
                  ))}
                </span>
              </span>
              {theme === value && <Check aria-label="Selected" className="size-5" />}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="motion-heading">
        <h2 id="motion-heading" className="text-lg font-semibold">
          Motion
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="motion-heading"
          className="mt-3 flex flex-col gap-2"
        >
          {MOTION_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                motion === option.value ? "border-ring bg-accent/25" : "border-border",
              )}
            >
              <input
                type="radio"
                name="motion"
                className="mt-1 accent-[var(--hb-ring)]"
                checked={motion === option.value}
                onChange={() => setMotion(option.value)}
              />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-lg font-semibold">
          Account
        </h2>
        <Card className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium">{me?.user.displayName ?? "…"}</p>
            <p className="text-muted">@{me?.user.username ?? "…"}</p>
            <p className="mt-1 text-muted">{me?.workspace.name}</p>
          </div>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </Card>
      </section>
    </div>
  );
}
