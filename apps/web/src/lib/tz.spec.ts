import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  startOfZonedDay,
  toDateKey,
  weekdayOfKey,
  zonedDateKey,
  zonedParts,
  zonedWallTimeToInstant,
} from "./tz";

describe("zonedParts", () => {
  it("reads wall-clock time in a zone", () => {
    const p = zonedParts(new Date("2026-11-01T20:00:00Z"), "Asia/Manila"); // UTC+8
    expect(p).toMatchObject({ year: 2026, month: 11, day: 2, hour: 4, minute: 0 });
  });
  it("never reports hour 24", () => {
    expect(zonedParts(new Date("2026-11-01T16:00:00Z"), "Asia/Manila").hour).toBe(0);
  });
  it("knows the weekday", () => {
    expect(zonedParts(new Date("2026-11-01T12:00:00Z"), "UTC").weekday).toBe(0); // Sunday
  });
});

describe("zonedWallTimeToInstant", () => {
  it("converts a fixed-offset zone", () => {
    expect(
      zonedWallTimeToInstant(
        { year: 2026, month: 11, day: 2, hour: 9 },
        "Asia/Manila",
      ).toISOString(),
    ).toBe("2026-11-02T01:00:00.000Z");
  });

  it("respects DST on both sides of the spring-forward date (New York)", () => {
    expect(
      zonedWallTimeToInstant(
        { year: 2026, month: 3, day: 7, hour: 12 },
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-03-07T17:00:00.000Z"); // EST
    expect(
      zonedWallTimeToInstant(
        { year: 2026, month: 3, day: 8, hour: 12 },
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-03-08T16:00:00.000Z"); // EDT
  });

  it("respects the fall-back date", () => {
    expect(
      zonedWallTimeToInstant(
        { year: 2026, month: 11, day: 1, hour: 12 },
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-11-01T17:00:00.000Z"); // EST
  });

  it.each([
    ["Asia/Manila", 2026, 11, 2, 9, 30],
    ["America/New_York", 2026, 3, 8, 15, 0],
    ["Europe/London", 2026, 10, 25, 12, 15],
    ["Pacific/Kiritimati", 2026, 1, 1, 0, 0],
    ["Australia/Lord_Howe", 2026, 4, 5, 18, 45],
    ["UTC", 2026, 12, 31, 23, 59],
  ])("round-trips wall time in %s", (zone, year, month, day, hour, minute) => {
    const instant = zonedWallTimeToInstant({ year, month, day, hour, minute }, zone);
    expect(zonedParts(instant, zone)).toMatchObject({ year, month, day, hour, minute });
  });
});

describe("days and months", () => {
  it("startOfZonedDay gives a 23h day when clocks spring forward", () => {
    const start = startOfZonedDay("2026-03-08", "America/New_York").getTime();
    const next = startOfZonedDay("2026-03-09", "America/New_York").getTime();
    expect((next - start) / 3_600_000).toBe(23);
  });
  it("the same instant is a different date in different zones", () => {
    const instant = new Date("2026-11-01T20:00:00Z");
    expect(zonedDateKey(instant, "Asia/Manila")).toBe("2026-11-02");
    expect(zonedDateKey(instant, "America/New_York")).toBe("2026-11-01");
  });
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });
  it("adds months, clamping the day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
  it("formats and reads date keys", () => {
    expect(toDateKey({ year: 2026, month: 3, day: 5 })).toBe("2026-03-05");
    expect(weekdayOfKey("2026-11-01")).toBe(0);
  });
});
