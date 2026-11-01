import { describe, expect, it } from "vitest";
import { formatDateOnly, parseDateOnly, todayInZone } from "./dates.js";
import { percentComplete } from "./progress.js";

describe("percentComplete", () => {
  it("is 0 when there is nothing to do", () => {
    expect(percentComplete({ completed: 0, total: 0, cancelled: 0 })).toBe(0);
    expect(percentComplete({ completed: 0, total: 3, cancelled: 3 })).toBe(0);
  });
  it("rounds completed / (total - cancelled)", () => {
    expect(percentComplete({ completed: 1, total: 3, cancelled: 0 })).toBe(33);
    expect(percentComplete({ completed: 2, total: 3, cancelled: 0 })).toBe(67);
    expect(percentComplete({ completed: 2, total: 5, cancelled: 1 })).toBe(50);
    expect(percentComplete({ completed: 4, total: 4, cancelled: 0 })).toBe(100);
  });
});

describe("date helpers", () => {
  it("round-trips date-only values without shifting the day", () => {
    expect(formatDateOnly(parseDateOnly("2026-03-08"))).toBe("2026-03-08");
    expect(formatDateOnly(parseDateOnly("2024-02-29"))).toBe("2024-02-29");
  });
  it("computes 'today' in the requested zone", () => {
    const instant = new Date("2026-11-01T20:00:00Z"); // 04:00 on the 2nd in Manila, still the 1st in New York
    expect(todayInZone("Asia/Manila", instant)).toBe("2026-11-02");
    expect(todayInZone("America/New_York", instant)).toBe("2026-11-01");
    expect(todayInZone("UTC", instant)).toBe("2026-11-01");
  });
});
