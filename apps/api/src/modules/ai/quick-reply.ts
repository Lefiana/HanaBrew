export interface QuickAction {
  status: "EXECUTED" | "REJECTED";
  outcome: string | null;
  summary: string;
}

/**
 * The confirmation Hana shows after simple changes in QUICK mode, composed from what actually happened.
 * It skips a second model call (the slowest part of "add a task") and, because it is built from the
 * recorded outcomes, can never claim something that didn't happen.
 */
export function composeQuickReply(actions: QuickAction[]): string {
  const done = actions.filter((a) => a.status === "EXECUTED");
  const skipped = actions.filter((a) => a.status === "REJECTED");
  if (done.length === 0) return "Okay, I didn't change anything.";
  const lines = ["Done ✓", ...done.map((a) => `• ${a.outcome ?? a.summary}`)];
  if (skipped.length) lines.push("Left as it was:", ...skipped.map((a) => `• ${a.summary}`));
  return lines.join("\n");
}
