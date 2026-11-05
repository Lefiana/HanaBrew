import type { AIMessage } from "@hanabrew/ai-core";
import { describe, expect, it } from "vitest";
import { toAiMessage, windowHistory } from "./history.js";

const user = (content: string): AIMessage => ({ role: "user", content });
const asst = (content: string): AIMessage => ({ role: "assistant", content });
const call = (id: string): AIMessage => ({
  role: "assistant",
  content: "",
  toolCalls: [{ id, name: "t", args: {} }],
});
const result = (id: string): AIMessage => ({
  role: "tool",
  toolCallId: id,
  name: "t",
  content: "{}",
});

describe("windowHistory", () => {
  it("keeps short conversations whole", () => {
    const m = [user("a"), asst("b")];
    expect(windowHistory(m)).toEqual(m);
  });

  it("starts at a user message and never splits a tool call from its result", () => {
    const messages: AIMessage[] = [];
    for (let i = 0; i < 30; i++)
      messages.push(user(`q${i}`), call(`c${i}`), result(`c${i}`), asst(`a${i}`));
    const out = windowHistory(messages);
    expect(out[0]!.role).toBe("user");
    expect(out.length).toBeLessThanOrEqual(40);
    // every tool result is preceded (somewhere earlier in the window) by its call
    const seen = new Set<string>();
    for (const m of out) {
      if (m.role === "assistant") m.toolCalls?.forEach((c) => seen.add(c.id));
      if (m.role === "tool") expect(seen.has(m.toolCallId)).toBe(true);
    }
  });

  it("respects the character budget, dropping the oldest turns", () => {
    const big = "x".repeat(15_000);
    const out = windowHistory([
      user("old"),
      asst(big),
      user("mid"),
      asst(big),
      user("new"),
      asst(big),
    ]);
    expect(out[0]).toEqual(user("mid"));
    expect(out.at(-1)).toEqual(asst(big));
  });

  it("falls back to the last user message when the budget would cut everything", () => {
    const out = windowHistory([user("hi"), asst("y".repeat(50_000))]);
    expect(out[0]!.role).toBe("user");
  });
});

describe("toAiMessage", () => {
  it("restores tool calls and provider state from storage", () => {
    const m = toAiMessage({
      role: "ASSISTANT",
      content: "",
      toolCalls: [{ id: "1", name: "x", args: {} }],
      providerState: { provider: "gemini", data: [1] },
      toolCallId: null,
      toolName: null,
    });
    expect(m).toMatchObject({
      role: "assistant",
      toolCalls: [{ id: "1" }],
      providerState: { provider: "gemini" },
    });
  });
  it("omits empty tool calls", () => {
    expect(
      toAiMessage({
        role: "ASSISTANT",
        content: "hi",
        toolCalls: [],
        providerState: null,
        toolCallId: null,
        toolName: null,
      }),
    ).toEqual({ role: "assistant", content: "hi" });
  });
});
