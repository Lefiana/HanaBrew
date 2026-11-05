import type { AIMessage, ToolCall } from "@hanabrew/ai-core";

export interface StoredMessage {
  role: "USER" | "ASSISTANT" | "TOOL";
  content: string;
  toolCalls: unknown;
  providerState: unknown;
  toolCallId: string | null;
  toolName: string | null;
}

const MAX_MESSAGES = 40;
const MAX_CHARS = 40_000;

const size = (m: AIMessage): number =>
  m.content.length +
  (m.role === "assistant" && m.toolCalls ? JSON.stringify(m.toolCalls).length : 0);

export function toAiMessage(row: StoredMessage): AIMessage {
  if (row.role === "USER") return { role: "user", content: row.content };
  if (row.role === "TOOL")
    return {
      role: "tool",
      toolCallId: row.toolCallId ?? "",
      name: row.toolName ?? "",
      content: row.content,
    };
  const toolCalls =
    Array.isArray(row.toolCalls) && row.toolCalls.length
      ? (row.toolCalls as ToolCall[])
      : undefined;
  const state = row.providerState as { provider?: string } | null;
  return {
    role: "assistant",
    content: row.content,
    ...(toolCalls ? { toolCalls } : {}),
    ...(state && typeof state === "object" && state.provider
      ? { providerState: row.providerState as never }
      : {}),
  };
}

/**
 * The most recent slice of the conversation that fits the budget. It always STARTS at a user message so an
 * assistant tool call is never separated from its tool result (providers reject orphaned tool messages).
 */
export function windowHistory(messages: AIMessage[]): AIMessage[] {
  let start = Math.max(0, messages.length - MAX_MESSAGES);
  const budgetStart = () => {
    let total = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      total += size(messages[i]!);
      if (total > MAX_CHARS) return i + 1;
    }
    return 0;
  };
  start = Math.max(start, budgetStart());
  while (start < messages.length && messages[start]!.role !== "user") start += 1;
  // If the budget cut left nothing starting with a user message, fall back to the last user message onward.
  if (start >= messages.length) {
    const lastUser = messages.map((m) => m.role).lastIndexOf("user");
    start = Math.max(0, lastUser);
  }
  return messages.slice(start);
}
