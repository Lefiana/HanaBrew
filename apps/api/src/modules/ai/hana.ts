import type { ChatItem, HanaMood, HanaResponse } from "@hanabrew/contracts";

const STARTERS = ["What's on my plate today?", "Plan my week", "Add a task for tomorrow"];

/**
 * Hana's visible mood and follow-up chips, derived from what actually happened in the latest exchange.
 * A mood is a presentation cue only: it says nothing about whether an answer is correct.
 */
export function deriveHana(items: ChatItem[], pendingCount: number): HanaResponse {
  const lastAssistant = [...items].reverse().find((item) => item.type === "assistant");
  const message = lastAssistant?.type === "assistant" ? lastAssistant.content : "";

  const lastUser = items.map((item) => item.type).lastIndexOf("user");
  const sinceUser = lastUser === -1 ? [] : items.slice(lastUser + 1);
  const actions = sinceUser.filter(
    (item): item is Extract<ChatItem, { type: "action" }> => item.type === "action",
  );

  let mood: HanaMood = "idle";
  let suggestions: string[] = ["What's on my plate today?", "Plan my week"];

  if (items.length === 0) {
    suggestions = STARTERS;
  } else if (pendingCount > 0) {
    mood = "listening"; // waiting for the user to decide
    suggestions = [];
  } else if (actions.some((a) => a.status === "FAILED" || a.status === "EXPIRED")) {
    mood = "concerned";
    suggestions = ["Try that again"];
  } else if (actions.some((a) => a.status === "EXECUTED" && a.risk !== "read")) {
    mood = "happy";
    suggestions = ["Show my open tasks", "What's on my calendar this week?"];
  }
  return { message, mood, suggestions };
}
