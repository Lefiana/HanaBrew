import type { ChatItem } from "@hanabrew/contracts";
import { describe, expect, it } from "vitest";
import { deriveHana } from "./hana.js";

const id = "00000000-0000-4000-8000-000000000001";
const at = "2026-11-02T00:00:00.000Z";
const user = (content = "hi"): ChatItem => ({ type: "user", id, content, createdAt: at });
const assistant = (content: string): ChatItem => ({
  type: "assistant",
  id,
  content,
  createdAt: at,
});
const action = (
  status: "EXECUTED" | "FAILED" | "PENDING" | "REJECTED" | "EXPIRED",
  risk: "read" | "write" | "destructive" = "write",
): ChatItem => ({
  type: "action",
  id,
  toolName: "t",
  risk,
  status,
  summary: "s",
  outcome: null,
  expiresAt: null,
  createdAt: at,
});

describe("deriveHana", () => {
  it("offers starter suggestions on an empty chat", () => {
    const hana = deriveHana([], 0);
    expect(hana.mood).toBe("idle");
    expect(hana.suggestions!.length).toBeGreaterThan(0);
  });
  it("listens while an approval is pending, with no chips to distract", () => {
    expect(
      deriveHana([user(), action("PENDING", "destructive"), assistant("Waiting on you")], 1),
    ).toMatchObject({ mood: "listening", suggestions: [] });
  });
  it("is happy after a successful change, but not after a read", () => {
    expect(deriveHana([user(), action("EXECUTED"), assistant("Done!")], 0).mood).toBe("happy");
    expect(deriveHana([user(), action("EXECUTED", "read"), assistant("Here you go")], 0).mood).toBe(
      "idle",
    );
  });
  it("is concerned when something failed or expired", () => {
    expect(deriveHana([user(), action("FAILED"), assistant("Hmm")], 0).mood).toBe("concerned");
    expect(deriveHana([user(), action("EXPIRED", "destructive")], 0).mood).toBe("concerned");
  });
  it("only looks at the latest exchange", () => {
    expect(
      deriveHana(
        [user(), action("FAILED"), assistant("old"), user("again"), assistant("fine now")],
        0,
      ).mood,
    ).toBe("idle");
  });
  it("returns the last assistant message as Hana's message", () => {
    expect(deriveHana([user(), assistant("first"), assistant("second")], 0).message).toBe("second");
  });
});
