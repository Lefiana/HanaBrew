"use client";

import { Coffee } from "lucide-react";
import { useEffect, useState } from "react";

function greetingFor(hour: number): string {
  if (hour < 5) return "Still up? Take it easy";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function useNow(intervalMs = 15_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** A cozy clock/greeting card. Uses the browser's local time zone. */
export function ClockWidget({ name }: { name?: string }) {
  const now = useNow();
  if (!now) return <div className="h-28 w-60" aria-hidden />;
  return (
    <div className="hb-glass w-60 rounded-xl p-4 shadow-soft">
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <Coffee aria-hidden className="size-4" />
        {greetingFor(now.getHours())}
        {name ? `, ${name}` : ""}
      </p>
      <p className="mt-1 text-4xl font-semibold tabular-nums">
        {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </p>
      <p className="text-sm text-muted">
        {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
      </p>
    </div>
  );
}
