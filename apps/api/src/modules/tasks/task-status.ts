import type { TaskStatus } from "@hanabrew/contracts";

/**
 * Every status may move to every other (you can reopen a completed task or un-cancel one).
 * What the rules guarantee is consistency of `completedAt`:
 *  - entering COMPLETED stamps it (and keeps the original stamp if the task was already completed);
 *  - leaving COMPLETED, or any other status, clears it.
 */
export function completedAtFor(
  next: TaskStatus,
  previous: { status: TaskStatus; completedAt: Date | null } | null,
  now: Date,
): Date | null {
  if (next !== "COMPLETED") return null;
  return previous?.status === "COMPLETED" && previous.completedAt ? previous.completedAt : now;
}
