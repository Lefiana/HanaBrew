import { describe, expect, it } from "vitest";
import { requiresConfirmation } from "./confirmation.js";

describe("requiresConfirmation", () => {
  it("never asks for reads", () => {
    expect(requiresConfirmation({ risk: "read" }, "DESTRUCTIVE_ONLY")).toBe(false);
    expect(requiresConfirmation({ risk: "read" }, "ALL_WRITES")).toBe(false);
  });
  it("always asks for destructive and multi-record actions, whatever the policy", () => {
    for (const policy of ["DESTRUCTIVE_ONLY", "ALL_WRITES"] as const) {
      expect(requiresConfirmation({ risk: "destructive" }, policy)).toBe(true);
      expect(requiresConfirmation({ risk: "write", multiRecord: true }, policy)).toBe(true);
    }
  });
  it("asks for ordinary writes only in strict mode", () => {
    expect(requiresConfirmation({ risk: "write" }, "DESTRUCTIVE_ONLY")).toBe(false);
    expect(requiresConfirmation({ risk: "write" }, "ALL_WRITES")).toBe(true);
  });
});
