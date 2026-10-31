"use client";

import { healthResponseSchema, readinessResponseSchema } from "@hanabrew/contracts";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { API_URL } from "@/lib/env";

function useCheck<S extends z.ZodType>(key: string, path: string, schema: S) {
  return useQuery<z.infer<S>, Error>({
    queryKey: ["status", key],
    queryFn: () => apiFetch(path, schema),
    retry: false,
    refetchInterval: 15_000,
  });
}

/** Public page for checking that the web app can reach the API and the API can reach its database. */
export function StatusPanel() {
  const live = useCheck("live", "/api/health", healthResponseSchema);
  const ready = useCheck("ready", "/api/health/ready", readinessResponseSchema);

  const rows: Array<{ label: string; ok: boolean | null; detail: string }> = [
    {
      label: "API",
      ok: live.isPending ? null : live.isSuccess,
      detail: live.isSuccess
        ? `v${live.data.version}, up ${live.data.uptimeSeconds}s`
        : (live.error?.message ?? "Checking…"),
    },
    {
      label: "Database",
      ok: ready.isPending ? null : ready.isSuccess && ready.data.checks.database === "up",
      detail: ready.isSuccess ? ready.data.checks.database : (ready.error?.message ?? "Checking…"),
    },
  ];

  return (
    <main className="hb-wallpaper flex min-h-dvh items-center justify-center p-4">
      <Card className="hb-glass w-full max-w-sm">
        <h1 className="text-xl font-semibold">System status</h1>
        <p className="mt-1 text-xs text-muted">API: {API_URL}</p>
        <ul className="mt-4 space-y-3" aria-live="polite">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{row.label}</span>
              <span className={row.ok === false ? "text-danger" : "text-muted"}>
                {row.ok === null ? "Checking…" : row.ok ? "OK" : "Unavailable"} — {row.detail}
              </span>
            </li>
          ))}
        </ul>
        <Link href="/" className="mt-5 inline-block text-sm underline underline-offset-2">
          Back to HanaBrew
        </Link>
      </Card>
    </main>
  );
}
