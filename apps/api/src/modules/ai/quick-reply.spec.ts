import { describe, expect, it } from "vitest";
import { composeQuickReply } from "./quick-reply.js";

describe("composeQuickReply", () => {
  it("lists what was done, using the recorded outcomes", () => {
    expect(
      composeQuickReply([
        { status: "EXECUTED", outcome: "Created task “Run”", summary: "Create task “Run”" },
      ]),
    ).toBe("Done ✓\n• Created task “Run”");
  });
  it("lists several outcomes", () => {
    const text = composeQuickReply([
      { status: "EXECUTED", outcome: "Created task “A”", summary: "s" },
      { status: "EXECUTED", outcome: "Created task “B”", summary: "s" },
    ]);
    expect(text.split("\n")).toEqual(["Done ✓", "• Created task “A”", "• Created task “B”"]);
  });
  it("mentions what was declined, and never claims a declined action happened", () => {
    const text = composeQuickReply([
      { status: "EXECUTED", outcome: "Updated 2 tasks", summary: "s" },
      { status: "REJECTED", outcome: null, summary: "Delete task “X” permanently" },
    ]);
    expect(text).toContain("Left as it was:");
    expect(text).toContain("• Delete task “X” permanently");
    expect(
      composeQuickReply([
        { status: "REJECTED", outcome: null, summary: "Delete task “X” permanently" },
      ]),
    ).toBe("Okay, I didn't change anything.");
  });
});
