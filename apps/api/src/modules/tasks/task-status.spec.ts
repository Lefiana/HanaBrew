import { describe, expect, it } from "vitest";
import { completedAtFor } from "./task-status.js";

const now = new Date("2026-11-02T10:00:00Z");
const earlier = new Date("2026-11-01T08:00:00Z");

describe("completedAtFor", () => {
  it("stamps the time when a task becomes completed", () => {
    expect(completedAtFor("COMPLETED", { status: "TODO", completedAt: null }, now)).toEqual(now);
    expect(completedAtFor("COMPLETED", null, now)).toEqual(now);
  });
  it("keeps the original stamp if it was already completed", () => {
    expect(completedAtFor("COMPLETED", { status: "COMPLETED", completedAt: earlier }, now)).toEqual(
      earlier,
    );
  });
  it.each(["TODO", "IN_PROGRESS", "CANCELLED"] as const)(
    "clears the stamp when moving to %s",
    (status) => {
      expect(completedAtFor(status, { status: "COMPLETED", completedAt: earlier }, now)).toBeNull();
    },
  );
});
