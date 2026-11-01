import { describe, expect, it } from "vitest";
import {
  allDayToInstants,
  createCalendarEventSchema,
  createProjectSchema,
  createTaskSchema,
  instantsToAllDayDates,
  listCalendarEventsQuerySchema,
  listTasksQuerySchema,
  updateCalendarEventSchema,
  updateProjectSchema,
  updateTaskSchema,
  validateEventTimes,
} from "./index.js";

describe("task contracts", () => {
  it("trims titles and normalises tags (lowercase, unique)", () => {
    const parsed = createTaskSchema.parse({
      title: "  Buy beans ",
      tags: ["Coffee", "coffee", " Errand "],
    });
    expect(parsed.title).toBe("Buy beans");
    expect(parsed.tags).toEqual(["coffee", "errand"]);
  });

  it.each([
    ["empty title", { title: "   " }],
    ["title too long", { title: "x".repeat(201) }],
    ["bad due date", { title: "a", dueDate: "2026-02-31" }],
    ["not a date", { title: "a", dueDate: "tomorrow" }],
    ["unknown status", { title: "a", status: "DONE" }],
    ["too many tags", { title: "a", tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }],
    ["bad tag characters", { title: "a", tags: ["no spaces!"] }],
    [
      "unknown field (mass assignment)",
      { title: "a", workspaceId: "11111111-1111-4111-8111-111111111111" },
    ],
    ["bad project id", { title: "a", projectId: "nope" }],
  ])("rejects %s", (_label, input) => {
    expect(createTaskSchema.safeParse(input).success).toBe(false);
  });

  it("PATCH accepts null to clear and rejects an empty patch", () => {
    expect(updateTaskSchema.parse({ dueDate: null, projectId: null, description: null })).toEqual({
      dueDate: null,
      projectId: null,
      description: null,
    });
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
  });

  it("PATCH does not inject defaults for omitted fields", () => {
    expect(updateTaskSchema.parse({ title: "x" })).toEqual({ title: "x" });
  });

  it("parses list filters from query strings", () => {
    const q = listTasksQuerySchema.parse({
      status: "TODO,IN_PROGRESS",
      priority: "HIGH",
      sort: "dueDate",
      limit: "25",
    });
    expect(q).toMatchObject({
      status: ["TODO", "IN_PROGRESS"],
      priority: ["HIGH"],
      sort: "dueDate",
      order: "desc",
      limit: 25,
    });
    expect(listTasksQuerySchema.safeParse({ status: "TODO,NOPE" }).success).toBe(false);
    expect(listTasksQuerySchema.safeParse({ projectId: "none" }).success).toBe(true);
    expect(listTasksQuerySchema.safeParse({ limit: "100000" }).success).toBe(false);
  });
});

describe("project contracts", () => {
  it("rejects a target date before the start date", () => {
    expect(
      createProjectSchema.safeParse({
        name: "P",
        startDate: "2026-05-02",
        targetDate: "2026-05-01",
      }).success,
    ).toBe(false);
    expect(
      createProjectSchema.safeParse({
        name: "P",
        startDate: "2026-05-01",
        targetDate: "2026-05-01",
      }).success,
    ).toBe(true);
    expect(
      updateProjectSchema.safeParse({ startDate: "2026-05-02", targetDate: "2026-05-01" }).success,
    ).toBe(false);
  });
  it("requires a name", () => {
    expect(createProjectSchema.safeParse({ name: " " }).success).toBe(false);
  });
});

describe("calendar time model", () => {
  it("round-trips all-day dates through floating instants (end exclusive)", () => {
    const { start, end } = allDayToInstants("2026-12-30", "2027-01-02");
    expect(start).toBe("2026-12-30T00:00:00.000Z");
    expect(end).toBe("2027-01-03T00:00:00.000Z");
    expect(instantsToAllDayDates(start, end)).toEqual({
      startDate: "2026-12-30",
      endDate: "2027-01-02",
    });
  });

  it("a single all-day event spans exactly 24h", () => {
    const { start, end } = allDayToInstants("2026-02-28", "2026-02-28");
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(86_400_000);
  });

  it("validates event times", () => {
    expect(
      validateEventTimes({
        allDay: false,
        start: "2026-11-02T09:00:00+08:00",
        end: "2026-11-02T10:00:00+08:00",
      }),
    ).toBeNull();
    expect(
      validateEventTimes({
        allDay: false,
        start: "2026-11-02T10:00:00Z",
        end: "2026-11-02T10:00:00Z",
      }),
    ).toMatch(/after/);
    expect(
      validateEventTimes({
        allDay: true,
        start: "2026-11-02T09:00:00Z",
        end: "2026-11-03T09:00:00Z",
      }),
    ).toMatch(/midnight/);
    expect(
      validateEventTimes({
        allDay: false,
        start: "2026-01-01T00:00:00Z",
        end: "2028-01-01T00:00:00Z",
      }),
    ).toMatch(/at most/);
  });

  it("accepts offsets and rejects naive datetimes and bad zones", () => {
    const base = { title: "Standup", timeZone: "Asia/Manila" };
    expect(
      createCalendarEventSchema.safeParse({
        ...base,
        start: "2026-11-02T09:00:00+08:00",
        end: "2026-11-02T09:30:00+08:00",
      }).success,
    ).toBe(true);
    expect(
      createCalendarEventSchema.safeParse({
        ...base,
        start: "2026-11-02T09:00:00",
        end: "2026-11-02T09:30:00",
      }).success,
    ).toBe(false);
    expect(
      createCalendarEventSchema.safeParse({
        ...base,
        timeZone: "Mars/Olympus",
        start: "2026-11-02T09:00:00Z",
        end: "2026-11-02T10:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("PATCH needs start and end together", () => {
    expect(updateCalendarEventSchema.safeParse({ start: "2026-11-02T09:00:00Z" }).success).toBe(
      false,
    );
    expect(updateCalendarEventSchema.safeParse({ title: "x" }).success).toBe(true);
  });

  it("limits list ranges", () => {
    expect(
      listCalendarEventsQuerySchema.safeParse({
        from: "2026-11-01T00:00:00Z",
        to: "2026-12-01T00:00:00Z",
      }).success,
    ).toBe(true);
    expect(
      listCalendarEventsQuerySchema.safeParse({
        from: "2026-11-01T00:00:00Z",
        to: "2027-11-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      listCalendarEventsQuerySchema.safeParse({
        from: "2026-12-01T00:00:00Z",
        to: "2026-11-01T00:00:00Z",
      }).success,
    ).toBe(false);
  });
});
