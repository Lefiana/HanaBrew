import type { ConfirmationPolicy } from "@hanabrew/contracts";

export type ToolRisk = "read" | "write" | "destructive";

/**
 * Does this tool call need the user's explicit approval before it runs?
 *  - destructive actions and actions on many records ALWAYS do (not configurable);
 *  - in strict mode (ALL_WRITES) every change does;
 *  - reads never do.
 */
export function requiresConfirmation(
  tool: { risk: ToolRisk; multiRecord?: boolean },
  policy: ConfirmationPolicy,
): boolean {
  if (tool.risk === "destructive" || tool.multiRecord) return true;
  return policy === "ALL_WRITES" && tool.risk === "write";
}
