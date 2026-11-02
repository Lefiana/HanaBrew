import type { CalendarEvent } from "@hanabrew/contracts";
import { describe, expect, it } from "vitest";
import {
  deadlinesForDay,
  eventsForDay,
  layoutDay,
  monthGrid,
  navigate,
  viewRange,
  weekKeys,
} from "./calendar-layout";

let n = 0;
function event(partial: Partial<CalendarEvent> & { start: string; end: string }): CalendarEvent {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    title: `e${n}`,
    description: null,
    category: null,
    allDay: false,
    timeZone: "UTC",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("grids", () => {
  it("month grid is 6 weeks of 7 days starting on the configured weekday", () => {
    const sunday = monthGrid("2026-11-15", 0);
    expect(sunday).toHaveLength(6);
    expect(sunday.every((row) => row.length === 7)).toBe(true);
    expect(sunday[0]![0]!.key).toBe("2026-11-01"); // Nov 1 2026 is a Sunday
    const monday = monthGrid("2026-11-15", 1);
    expect(monday[0]![0]!.key).toBe("2026-10-26");
    expect(monday[0]![0]!.inMonth).toBe(false);
  });

  it("marks only the displayed month as in-month", () => {
    const days = monthGrid("2026-02-10", 0).flat();
    expect(days.filter((d) => d.inMonth)).toHaveLength(28);
  });

  it("week keys are seven consecutive days containing the anchor", () => {
    const keys = weekKeys("2026-11-04", 0);
    expect(keys[0]).toBe("2026-11-01");
    expect(keys).toHaveLength(7);
    expect(keys).toContain("2026-11-04");
  });

  it("navigates by view", () => {
    expect(navigate("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(navigate("week", "2026-11-04", -1)).toBe("2026-10-28");
    expect(navigate("day", "2026-12-31", 1)).toBe("2027-01-01");
  });

  it("asks the API for exactly the visible range in the user's zone", () => {
    const { from, to } = viewRange("day", "2026-11-02", "Asia/Manila");
    expect(from).toBe("2026-11-01T16:00:00.000Z");
    expect(to).toBe("2026-11-02T16:00:00.000Z");
  });
});

describe("eventsForDay", () => {
  it("places a timed event on the day it falls in for the viewer's zone", () => {
    const e = event({ start: "2026-11-01T20:00:00.000Z", end: "2026-11-01T21:00:00.000Z" });
    expect(eventsForDay([e], "2026-11-02", "Asia/Manila").timed).toHaveLength(1);
    expect(eventsForDay([e], "2026-11-01", "Asia/Manila").timed).toHaveLength(0);
    expect(eventsForDay([e], "2026-11-01", "UTC").timed).toHaveLength(1);
  });

  it("shows a multi-day timed event on every day it touches", () => {
    const e = event({ start: "2026-11-01T22:00:00.000Z", end: "2026-11-03T02:00:00.000Z" });
    const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"].map(
      (k) => eventsForDay([e], k, "UTC").timed.length,
    );
    expect(days).toEqual([1, 1, 1, 0]);
  });

  it("does not show an event on the day it ends at midnight", () => {
    const e = event({ start: "2026-11-01T22:00:00.000Z", end: "2026-11-02T00:00:00.000Z" });
    expect(eventsForDay([e], "2026-11-02", "UTC").timed).toHaveLength(0);
  });

  it("all-day events are floating dates and ignore the viewer's zone", () => {
    const holiday = event({
      allDay: true,
      start: "2026-12-24T00:00:00.000Z",
      end: "2026-12-26T00:00:00.000Z",
    }); // 24th and 25th
    for (const zone of ["Pacific/Kiritimati", "America/Los_Angeles", "UTC"]) {
      expect(eventsForDay([holiday], "2026-12-24", zone).allDay).toHaveLength(1);
      expect(eventsForDay([holiday], "2026-12-25", zone).allDay).toHaveLength(1);
      expect(eventsForDay([holiday], "2026-12-26", zone).allDay).toHaveLength(0);
      expect(eventsForDay([holiday], "2026-12-23", zone).allDay).toHaveLength(0);
    }
  });
});

describe("layoutDay", () => {
  const at = (h: number, m = 0) =>
    `2026-11-02T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;

  it("positions events by minutes from midnight", () => {
    const [p] = layoutDay([event({ start: at(9, 30), end: at(10, 30) })], "2026-11-02", "UTC");
    expect(p).toMatchObject({ top: 570, height: 60, column: 0, columns: 1 });
  });

  it("puts overlapping events in separate columns and others in full width", () => {
    const a = event({ start: at(9), end: at(11) });
    const b = event({ start: at(10), end: at(12) });
    const c = event({ start: at(13), end: at(14) });
    const out = layoutDay([a, b, c], "2026-11-02", "UTC");
    const byId = (e: CalendarEvent) => out.find((p) => p.event.id === e.id)!;
    expect([byId(a).column, byId(b).column]).toEqual([0, 1]);
    expect(byId(a).columns).toBe(2);
    expect(byId(b).columns).toBe(2);
    expect(byId(c)).toMatchObject({ column: 0, columns: 1 });
  });

  it("reuses a freed column within a cluster", () => {
    const a = event({ start: at(9), end: at(10) });
    const b = event({ start: at(9), end: at(12) });
    const c = event({ start: at(10), end: at(11) });
    const out = layoutDay([a, b, c], "2026-11-02", "UTC");
    expect(out.find((p) => p.event.id === c.id)!.column).toBe(
      out.find((p) => p.event.id === a.id)!.column,
    );
    expect(out.every((p) => p.columns === 2)).toBe(true);
  });

  it("clips events that cross midnight and gives tiny events a visible height", () => {
    const [clipped] = layoutDay(
      [event({ start: "2026-11-01T22:00:00.000Z", end: "2026-11-02T01:00:00.000Z" })],
      "2026-11-02",
      "UTC",
    );
    expect(clipped).toMatchObject({ top: 0, height: 60 });
    const [tiny] = layoutDay([event({ start: at(9), end: at(9, 5) })], "2026-11-02", "UTC");
    expect(tiny!.height).toBe(20);
  });
});

describe("deadlinesForDay", () => {
  const task = (dueDate: string | null) => ({ id: `t-${dueDate}`, dueDate }) as never;
  const project = (targetDate: string | null) => ({ id: `p-${targetDate}`, targetDate }) as never;
  const data = {
    tasks: [task("2026-11-10"), task("2026-11-10"), task("2026-11-11")],
    projects: [project("2026-11-10"), project("2026-12-01")],
  };

  it("matches tasks and projects by calendar date", () => {
    const day = deadlinesForDay(data, "2026-11-10");
    expect(day.tasks).toHaveLength(2);
    expect(day.projects).toHaveLength(1);
    expect(deadlinesForDay(data, "2026-11-11")).toEqual({ tasks: [data.tasks[2]], projects: [] });
  });
  it("is empty for other days and while loading", () => {
    expect(deadlinesForDay(data, "2026-11-12")).toEqual({ tasks: [], projects: [] });
    expect(deadlinesForDay(undefined, "2026-11-10")).toEqual({ tasks: [], projects: [] });
  });
});
