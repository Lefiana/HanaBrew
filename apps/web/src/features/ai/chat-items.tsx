"use client";

import type { ChatItem } from "@hanabrew/contracts";
import { AlertTriangle, Check, Clock, ShieldQuestion, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function Bubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
          role === "user"
            ? "rounded-br-sm bg-accent text-on-accent"
            : "rounded-bl-sm border border-border bg-surface",
        )}
      >
        {children}
      </p>
    </div>
  );
}

type ActionItem = Extract<ChatItem, { type: "action" }>;

const STATUS_LABEL: Record<ActionItem["status"], string> = {
  PENDING: "Needs your approval",
  RUNNING: "Working…",
  EXECUTED: "Done",
  REJECTED: "Declined",
  FAILED: "Didn't work",
  EXPIRED: "Expired",
};

/** What Hana did or wants to do. The summary comes from the server, built from the validated arguments. */
export function ActionCard({
  item,
  busy,
  onDecide,
}: {
  item: ActionItem;
  busy: boolean;
  onDecide: (id: string, decision: "approve" | "reject") => void;
}) {
  const pending = item.status === "PENDING";
  const failed = item.status === "FAILED" || item.status === "EXPIRED";
  return (
    <div
      className={cn(
        "ml-2 max-w-[90%] rounded-xl border p-3 text-sm",
        pending
          ? "border-ring bg-accent/15"
          : failed
            ? "border-danger/50 bg-danger/5"
            : "border-border bg-surface",
      )}
    >
      <div className="flex items-start gap-2">
        {pending ? (
          <ShieldQuestion aria-hidden className="mt-0.5 size-4 shrink-0" />
        ) : failed ? (
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
        ) : item.status === "REJECTED" ? (
          <X aria-hidden className="mt-0.5 size-4 shrink-0" />
        ) : (
          <Check aria-hidden className="mt-0.5 size-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{item.summary}</p>
          {item.outcome && (
            <p className={cn("mt-0.5 text-xs", failed ? "text-danger" : "text-muted")}>
              {item.outcome}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <Badge
              tone={
                pending
                  ? "accent"
                  : failed
                    ? "danger"
                    : item.status === "EXECUTED"
                      ? "sage"
                      : "neutral"
              }
            >
              {STATUS_LABEL[item.status]}
            </Badge>
            {item.risk === "destructive" && <Badge tone="danger">Can’t be undone</Badge>}
            {pending && item.expiresAt && (
              <span className="inline-flex items-center gap-1 text-muted">
                <Clock aria-hidden className="size-3" /> Expires{" "}
                {new Date(item.expiresAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>
      </div>
      {pending && (
        <div className="mt-2 flex gap-2 pl-6">
          <Button size="sm" disabled={busy} onClick={() => onDecide(item.id, "approve")}>
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onDecide(item.id, "reject")}
          >
            Decline
          </Button>
        </div>
      )}
    </div>
  );
}
