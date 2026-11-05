import type { ChatItem } from "@hanabrew/contracts";

interface MessageRow {
  id: string;
  role: "USER" | "ASSISTANT" | "TOOL";
  content: string;
  toolCalls: unknown;
  createdAt: Date;
}
export interface ActionRow {
  id: string;
  toolCallId: string;
  toolName: string;
  risk: "READ" | "WRITE" | "DESTRUCTIVE";
  status: "PENDING" | "RUNNING" | "EXECUTED" | "REJECTED" | "FAILED" | "EXPIRED";
  summary: string;
  result: unknown;
  expiresAt: Date | null;
  createdAt: Date;
}

function outcomeOf(action: ActionRow): string | null {
  const result = action.result as { ok?: boolean; outcome?: string; error?: string } | null;
  if (!result) return null;
  return (result.ok ? result.outcome : result.error) ?? null;
}

/** The chat as the user sees it: their messages, Hana's replies, and a card for each action Hana took or proposed. */
export function buildItems(messages: MessageRow[], actions: ActionRow[]): ChatItem[] {
  const byCall = new Map(actions.map((a) => [a.toolCallId, a]));
  const items: ChatItem[] = [];
  for (const message of messages) {
    if (message.role === "USER") {
      items.push({
        type: "user",
        id: message.id,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      });
    } else if (message.role === "ASSISTANT") {
      if (message.content.trim())
        items.push({
          type: "assistant",
          id: message.id,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        });
      const calls = Array.isArray(message.toolCalls)
        ? (message.toolCalls as Array<{ id: string }>)
        : [];
      for (const call of calls) {
        const action = byCall.get(call.id);
        if (!action) continue;
        items.push({
          type: "action",
          id: action.id,
          toolName: action.toolName,
          risk: action.risk.toLowerCase() as "read" | "write" | "destructive",
          status: action.status,
          summary: action.summary,
          outcome: outcomeOf(action),
          expiresAt: action.expiresAt ? action.expiresAt.toISOString() : null,
          createdAt: action.createdAt.toISOString(),
        });
      }
    }
  }
  return items;
}
