import type { NestExpressApplication } from "@nestjs/platform-express";
import {
  calendarEventSchema,
  dashboardSchema,
  projectSchema,
  taskSchema,
  taskSummarySchema,
  allDayToInstants,
} from "@hanabrew/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { bootApp, Client, dateFromToday, ORIGIN } from "./helpers.js";

let app: NestExpressApplication;
let prisma: PrismaService;
let alice: Client;
let bob: Client;

beforeAll(async () => {
  app = await bootApp();
  prisma = app.get(PrismaService);
  alice = await Client.signUp(app, "p_alice");
  bob = await Client.signUp(app, "p_bob");
});
afterAll(async () => {
  await app?.close();
});

const newTask = async (c: Client, body: Record<string, unknown>) => {
  const res = await c.post("/api/tasks", { title: "t", ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return taskSchema.parse(res.body);
};

describe("every M2 route requires a session", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it.each([
    ["get", "/api/tasks"],
    ["get", "/api/tasks/summary"],
    ["post", "/api/tasks"],
    ["get", `/api/tasks/${id}`],
    ["patch", `/api/tasks/${id}`],
    ["delete", `/api/tasks/${id}`],
    ["get", "/api/projects"],
    ["post", "/api/projects"],
    ["get", "/api/calendar-events?from=2026-11-01T00:00:00Z&to=2026-11-02T00:00:00Z"],
    ["post", "/api/calendar-events"],
    ["get", "/api/calendar-deadlines?from=2026-11-01&to=2026-11-30"],
    ["get", "/api/settings"],
    ["patch", "/api/settings"],
    ["get", "/api/dashboard"],
  ] as const)("%s %s -> 401", async (method, path) => {
    const res = await request(app.getHttpServer())[method](path).set("Origin", ORIGIN).send({});
    expect(res.status).toBe(401);
  });
});

describe("tasks", () => {
  it("creates with defaults, reads, updates, and deletes", async () => {
    const created = await newTask(alice, { title: "  Roast beans  " });
    expect(created).toMatchObject({
      title: "Roast beans",
      status: "TODO",
      priority: "MEDIUM",
      dueDate: null,
      completedAt: null,
      tags: [],
      projectId: null,
    });

    const got = await alice.get(`/api/tasks/${created.id}`);
    expect(got.status).toBe(200);

    const patched = await alice.patch(`/api/tasks/${created.id}`, {
      title: "Roast more beans",
      priority: "URGENT",
      dueDate: "2026-12-24",
      tags: ["Coffee", "coffee"],
    });
    expect(taskSchema.parse(patched.body)).toMatchObject({
      title: "Roast more beans",
      priority: "URGENT",
      dueDate: "2026-12-24",
      tags: ["coffee"],
    });

    const cleared = await alice.patch(`/api/tasks/${created.id}`, { dueDate: null });
    expect(cleared.body.dueDate).toBeNull();

    expect((await alice.delete(`/api/tasks/${created.id}`)).status).toBe(204);
    expect((await alice.get(`/api/tasks/${created.id}`)).status).toBe(404);
  });

  it("keeps completedAt consistent with status", async () => {
    const t = await newTask(alice, {});
    const done = taskSchema.parse(
      (await alice.patch(`/api/tasks/${t.id}`, { status: "COMPLETED" })).body,
    );
    expect(done.completedAt).toBeTruthy();

    const again = taskSchema.parse(
      (await alice.patch(`/api/tasks/${t.id}`, { status: "COMPLETED" })).body, // repeating COMPLETED is a no-op
    );
    expect(again.completedAt).toBe(done.completedAt);

    const reopened = taskSchema.parse(
      (await alice.patch(`/api/tasks/${t.id}`, { status: "IN_PROGRESS" })).body,
    );
    expect(reopened.completedAt).toBeNull();

    const bornDone = await newTask(alice, { status: "COMPLETED" });
    expect(bornDone.completedAt).toBeTruthy();
  });

  it("returns 400 with per-field issues for bad input", async () => {
    const res = await alice.post("/api/tasks", {
      title: "",
      dueDate: "2026-02-31",
      priority: "SOON",
    });
    expect(res.status).toBe(400);
    const paths = (res.body.issues as Array<{ path: string }>).map((i) => i.path).sort();
    expect(paths).toEqual(["dueDate", "priority", "title"]);
    expect(
      (await alice.patch(`/api/tasks/${"11111111-1111-4111-8111-111111111111"}`, {})).status,
    ).toBe(400);
    expect((await alice.get("/api/tasks/not-a-uuid")).status).toBe(400);
  });

  it("refuses to let a client choose ownership fields", async () => {
    const foreign = "22222222-2222-4222-8222-222222222222";
    const res = await alice.post("/api/tasks", { title: "sneaky", workspaceId: foreign });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.issues)).toContain("workspaceId");
  });

  it("filters, searches and sorts", async () => {
    const c = await Client.signUp(app, "p_filters");
    const a = await newTask(c, {
      title: "Write report",
      priority: "LOW",
      dueDate: "2026-11-10",
      tags: ["work"],
    });
    const b = await newTask(c, {
      title: "Buy oat milk",
      priority: "URGENT",
      dueDate: "2026-11-05",
      tags: ["home", "errand"],
    });
    const d = await newTask(c, {
      title: "Plan trip",
      priority: "HIGH",
      status: "IN_PROGRESS",
      description: "Tokyo in spring",
    });
    const e = await newTask(c, { title: "Old chore", status: "CANCELLED" });
    const ids = (res: request.Response) => (res.body as Array<{ id: string }>).map((t) => t.id);

    expect(ids(await c.get("/api/tasks?status=TODO,IN_PROGRESS")).sort()).toEqual(
      [a.id, b.id, d.id].sort(),
    );
    expect(ids(await c.get("/api/tasks?status=CANCELLED"))).toEqual([e.id]);
    expect(ids(await c.get("/api/tasks?priority=URGENT,HIGH")).sort()).toEqual([b.id, d.id].sort());
    expect(ids(await c.get("/api/tasks?tag=errand"))).toEqual([b.id]);
    expect(ids(await c.get("/api/tasks?q=OAT"))).toEqual([b.id]);
    expect(ids(await c.get("/api/tasks?q=tokyo"))).toEqual([d.id]); // matches description
    expect(ids(await c.get("/api/tasks?dueFrom=2026-11-06&dueTo=2026-11-30"))).toEqual([a.id]);
    expect(ids(await c.get("/api/tasks?projectId=none")).length).toBe(4);

    const byDue = ids(await c.get("/api/tasks?sort=dueDate&order=asc"));
    expect(byDue.slice(0, 2)).toEqual([b.id, a.id]);
    expect(byDue.slice(2).sort()).toEqual([d.id, e.id].sort()); // no due date -> last

    const byPriority = ids(await c.get("/api/tasks?sort=priority&order=desc"));
    expect(byPriority.slice(0, 2)).toEqual([b.id, d.id]); // URGENT, then HIGH

    expect((await c.get("/api/tasks?status=NOPE")).status).toBe(400);
    expect((await c.get("/api/tasks?limit=2")).body).toHaveLength(2);
  });

  it("summarises from real records", async () => {
    const c = await Client.signUp(app, "p_summary");
    await newTask(c, { status: "COMPLETED" });
    await newTask(c, { status: "COMPLETED" });
    await newTask(c, { status: "TODO", dueDate: dateFromToday(-3) }); // overdue
    await newTask(c, { status: "IN_PROGRESS", dueDate: dateFromToday(5) });
    await newTask(c, { status: "CANCELLED", dueDate: dateFromToday(-10) }); // not "open", so not overdue
    const summary = taskSummarySchema.parse((await c.get("/api/tasks/summary?timeZone=UTC")).body);
    expect(summary).toEqual({
      todo: 1,
      inProgress: 1,
      completed: 2,
      cancelled: 1,
      total: 5,
      overdue: 1,
      completionPercent: 50,
    });
  });
});

describe("projects", () => {
  it("derives progress from linked task records", async () => {
    const c = await Client.signUp(app, "p_projects");
    const created = await c.post("/api/projects", {
      name: "Cafe launch",
      startDate: "2026-11-01",
      targetDate: "2026-12-01",
    });
    expect(created.status).toBe(201);
    const project = projectSchema.parse(created.body);
    expect(project.status).toBe("PLANNING");
    expect(project.progress).toEqual({
      total: 0,
      todo: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
      percent: 0,
    });

    await newTask(c, { projectId: project.id, status: "COMPLETED" });
    await newTask(c, { projectId: project.id, status: "COMPLETED" });
    await newTask(c, { projectId: project.id, status: "IN_PROGRESS" });
    await newTask(c, { projectId: project.id, status: "TODO" });
    await newTask(c, { projectId: project.id, status: "CANCELLED" });
    await newTask(c, { title: "unrelated" });

    const got = projectSchema.parse((await c.get(`/api/projects/${project.id}`)).body);
    expect(got.progress).toEqual({
      total: 5,
      todo: 1,
      inProgress: 1,
      completed: 2,
      cancelled: 1,
      percent: 50,
    });

    const list = (await c.get("/api/projects")).body as Array<{
      id: string;
      progress: { percent: number };
    }>;
    expect(list.find((p) => p.id === project.id)?.progress.percent).toBe(50);
  });

  it("deleting a project keeps its tasks", async () => {
    const c = await Client.signUp(app, "p_projdel");
    const project = projectSchema.parse((await c.post("/api/projects", { name: "Temp" })).body);
    const task = await newTask(c, { projectId: project.id });
    expect((await c.delete(`/api/projects/${project.id}`)).status).toBe(204);
    const after = taskSchema.parse((await c.get(`/api/tasks/${task.id}`)).body);
    expect(after.projectId).toBeNull();
  });

  it("validates dates against stored values and hides archived projects by default", async () => {
    const c = await Client.signUp(app, "p_projdates");
    const project = projectSchema.parse(
      (await c.post("/api/projects", { name: "Dated", startDate: "2026-11-10" })).body,
    );
    const bad = await c.patch(`/api/projects/${project.id}`, { targetDate: "2026-11-01" });
    expect(bad.status).toBe(400);
    expect(bad.body.issues[0].path).toBe("targetDate");
    expect(
      (
        await c.post("/api/projects", {
          name: "X",
          startDate: "2026-05-02",
          targetDate: "2026-05-01",
        })
      ).status,
    ).toBe(400);

    await c.patch(`/api/projects/${project.id}`, { status: "ARCHIVED" });
    const visible = (await c.get("/api/projects")).body as Array<{ id: string }>;
    expect(visible.some((p) => p.id === project.id)).toBe(false);
    const all = (await c.get("/api/projects?includeArchived=true")).body as Array<{ id: string }>;
    expect(all.some((p) => p.id === project.id)).toBe(true);
    const archivedOnly = (await c.get("/api/projects?status=ARCHIVED")).body as Array<{
      id: string;
    }>;
    expect(archivedOnly.map((p) => p.id)).toEqual([project.id]);
  });

  it("the database refuses a target date before the start date", async () => {
    const owner = await prisma.client.workspace.findFirstOrThrow();
    await expect(
      prisma.client.project.create({
        data: {
          workspaceId: owner.id,
          name: "bad",
          startDate: new Date("2026-05-02"),
          targetDate: new Date("2026-05-01"),
        },
      }),
    ).rejects.toBeDefined();
  });
});

describe("calendar", () => {
  const base = { title: "Standup", timeZone: "Asia/Manila" };

  it("stores exact instants and lists by overlap (half-open range)", async () => {
    const c = await Client.signUp(app, "p_cal");
    const created = await c.post("/api/calendar-events", {
      ...base,
      start: "2026-11-02T09:00:00+08:00",
      end: "2026-11-02T10:00:00+08:00",
      category: "work",
    });
    expect(created.status).toBe(201);
    const event = calendarEventSchema.parse(created.body);
    expect(event.start).toBe("2026-11-02T01:00:00.000Z");
    expect(event).toMatchObject({ allDay: false, timeZone: "Asia/Manila", category: "work" });

    const range = (from: string, to: string) =>
      c.get(`/api/calendar-events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    expect((await range("2026-11-02T00:00:00Z", "2026-11-03T00:00:00Z")).body).toHaveLength(1);
    expect((await range("2026-11-02T01:30:00Z", "2026-11-02T05:00:00Z")).body).toHaveLength(1); // overlaps the tail
    expect((await range("2026-11-02T02:00:00Z", "2026-11-02T05:00:00Z")).body).toHaveLength(0); // starts exactly when it ends
    expect((await range("2026-11-01T00:00:00Z", "2026-11-02T01:00:00Z")).body).toHaveLength(0); // ends exactly when it starts
    expect((await range("2026-11-02T00:00:00Z", "2027-11-02T00:00:00Z")).status).toBe(400); // range too large
  });

  it("treats all-day events as floating dates (end exclusive)", async () => {
    const c = await Client.signUp(app, "p_cal2");
    const { start, end } = allDayToInstants("2026-12-24", "2026-12-26");
    const res = await c.post("/api/calendar-events", {
      ...base,
      title: "Holiday",
      allDay: true,
      start,
      end,
    });
    expect(res.status).toBe(201);
    expect(calendarEventSchema.parse(res.body)).toMatchObject({
      allDay: true,
      start: "2026-12-24T00:00:00.000Z",
      end: "2026-12-27T00:00:00.000Z",
    });

    const notMidnight = await c.post("/api/calendar-events", {
      ...base,
      allDay: true,
      start: "2026-12-24T09:00:00Z",
      end: "2026-12-25T09:00:00Z",
    });
    expect(notMidnight.status).toBe(400);
  });

  it("rejects events that end before they start, and bad zones", async () => {
    const c = await Client.signUp(app, "p_cal3");
    expect(
      (
        await c.post("/api/calendar-events", {
          ...base,
          start: "2026-11-02T10:00:00Z",
          end: "2026-11-02T09:00:00Z",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await c.post("/api/calendar-events", {
          ...base,
          timeZone: "Mars/Base",
          start: "2026-11-02T09:00:00Z",
          end: "2026-11-02T10:00:00Z",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await c.post("/api/calendar-events", {
          ...base,
          start: "2026-11-02T09:00:00",
          end: "2026-11-02T10:00:00",
        })
      ).status,
    ).toBe(400); // no offset
  });

  it("validates partial updates against the stored event", async () => {
    const c = await Client.signUp(app, "p_cal4");
    const ev = calendarEventSchema.parse(
      (
        await c.post("/api/calendar-events", {
          ...base,
          start: "2026-11-02T09:00:00Z",
          end: "2026-11-02T10:00:00Z",
        })
      ).body,
    );
    expect(
      (await c.patch(`/api/calendar-events/${ev.id}`, { start: "2026-11-02T09:00:00Z" })).status,
    ).toBe(400); // needs both
    expect((await c.patch(`/api/calendar-events/${ev.id}`, { allDay: true })).status).toBe(400); // 09:00 isn't a whole day
    const moved = await c.patch(`/api/calendar-events/${ev.id}`, {
      title: "Moved",
      start: "2026-11-03T09:00:00Z",
      end: "2026-11-03T11:00:00Z",
    });
    expect(calendarEventSchema.parse(moved.body)).toMatchObject({
      title: "Moved",
      start: "2026-11-03T09:00:00.000Z",
    });
    expect((await c.delete(`/api/calendar-events/${ev.id}`)).status).toBe(204);
    expect((await c.get(`/api/calendar-events/${ev.id}`)).status).toBe(404);
  });

  it("the database refuses an event that ends before it starts", async () => {
    const ws = await prisma.client.workspace.findFirstOrThrow();
    await expect(
      prisma.client.calendarEvent.create({
        data: {
          workspaceId: ws.id,
          title: "bad",
          startsAt: new Date("2026-11-02T10:00:00Z"),
          endsAt: new Date("2026-11-02T10:00:00Z"),
          timeZone: "UTC",
        },
      }),
    ).rejects.toBeDefined();
  });
});

describe("settings and dashboard", () => {
  it("is unset until chosen, saves a valid zone, and rejects unknown zones", async () => {
    const c = await Client.signUp(app, "p_settings");
    expect((await c.get("/api/settings")).body).toEqual({ timeZone: null });
    expect((await c.patch("/api/settings", { timeZone: "Asia/Manila" })).body).toEqual({
      timeZone: "Asia/Manila",
    });
    expect((await c.get("/api/settings")).body).toEqual({ timeZone: "Asia/Manila" });
    expect((await c.patch("/api/settings", { timeZone: "Nowhere/Land" })).status).toBe(400);
    expect((await c.patch("/api/settings", {})).status).toBe(400);
  });

  it("aggregates everything from stored data, in the right time zone", async () => {
    const c = await Client.signUp(app, "p_dash");
    const project = projectSchema.parse(
      (await c.post("/api/projects", { name: "Launch", status: "ACTIVE" })).body,
    );
    await newTask(c, { title: "Due soon", dueDate: dateFromToday(1), projectId: project.id });
    await newTask(c, { title: "Done", status: "COMPLETED", projectId: project.id });
    const inOneHour = new Date(Date.now() + 3_600_000).toISOString();
    const inTwoHours = new Date(Date.now() + 7_200_000).toISOString();
    await c.post("/api/calendar-events", {
      title: "Soon",
      timeZone: "UTC",
      start: inOneHour,
      end: inTwoHours,
    });

    const res = await c.get("/api/dashboard?timeZone=Pacific/Kiritimati"); // UTC+14
    expect(res.status).toBe(200);
    const dash = dashboardSchema.parse(res.body);
    expect(dash.timeZone).toBe("Pacific/Kiritimati");
    expect(dash.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dash.tasks.summary).toMatchObject({ total: 2, completed: 1, completionPercent: 50 });
    expect(dash.tasks.dueSoon.map((t) => t.title)).toEqual(["Due soon"]);
    expect(dash.events.upcoming.map((e) => e.title)).toEqual(["Soon"]);
    expect(dash.projects.inFlight[0]).toMatchObject({ name: "Launch", progress: { percent: 50 } });
  });
});

describe("completed tasks are locked", () => {
  const done = async (c: Client, body: Record<string, unknown> = {}) =>
    newTask(c, { title: "locked one", status: "COMPLETED", ...body });

  it("rejects edits to a completed task (409) and leaves it untouched", async () => {
    const c = await Client.signUp(app, "p_lock1");
    const project = projectSchema.parse((await c.post("/api/projects", { name: "P" })).body);
    const t = await done(c, { title: "Shipped", priority: "HIGH", tags: ["x"] });

    for (const patch of [
      { title: "renamed" },
      { description: "new notes" },
      { priority: "LOW" },
      { dueDate: "2026-12-01" },
      { tags: ["y"] },
      { projectId: project.id },
      { status: "CANCELLED" },
      { status: "TODO", title: "reopen and edit in one go" },
    ]) {
      const res = await c.patch(`/api/tasks/${t.id}`, patch);
      expect(res.status, JSON.stringify(patch)).toBe(409);
      expect(res.body.message).toMatch(/locked/i);
    }
    const after = taskSchema.parse((await c.get(`/api/tasks/${t.id}`)).body);
    expect(after).toMatchObject({
      title: "Shipped",
      priority: "HIGH",
      tags: ["x"],
      status: "COMPLETED",
      projectId: null,
    });
    expect(after.completedAt).toBe(t.completedAt);
  });

  it("allows an explicit reopen on its own, after which the task is editable again", async () => {
    const c = await Client.signUp(app, "p_lock2");
    const t = await done(c);
    const reopened = taskSchema.parse(
      (await c.patch(`/api/tasks/${t.id}`, { status: "TODO" })).body,
    );
    expect(reopened).toMatchObject({ status: "TODO", completedAt: null });
    expect((await c.patch(`/api/tasks/${t.id}`, { title: "edited after reopen" })).status).toBe(
      200,
    );

    const other = await done(c);
    expect((await c.patch(`/api/tasks/${other.id}`, { status: "IN_PROGRESS" })).body.status).toBe(
      "IN_PROGRESS",
    );
  });

  it("reopening lowers project progress, and completing again raises it", async () => {
    const c = await Client.signUp(app, "p_lock3");
    const project = projectSchema.parse((await c.post("/api/projects", { name: "Progress" })).body);
    const a = await done(c, { projectId: project.id });
    await newTask(c, { projectId: project.id });
    const percent = async () => (await c.get(`/api/projects/${project.id}`)).body.progress.percent;
    expect(await percent()).toBe(50);
    await c.patch(`/api/tasks/${a.id}`, { status: "TODO" });
    expect(await percent()).toBe(0);
    await c.patch(`/api/tasks/${a.id}`, { status: "COMPLETED" });
    expect(await percent()).toBe(50);
  });

  it("cancelled tasks are excluded from progress rather than counted as incomplete", async () => {
    const c = await Client.signUp(app, "p_lock4");
    const project = projectSchema.parse((await c.post("/api/projects", { name: "Cancel" })).body);
    await done(c, { projectId: project.id });
    await done(c, { projectId: project.id });
    const open = await newTask(c, { projectId: project.id });
    await newTask(c, { projectId: project.id });
    await newTask(c, { projectId: project.id });
    const progress = async () => (await c.get(`/api/projects/${project.id}`)).body.progress;
    expect((await progress()).percent).toBe(40); // 2 of 5
    await c.patch(`/api/tasks/${open.id}`, { status: "CANCELLED" });
    expect(await progress()).toMatchObject({ cancelled: 1, percent: 50 }); // 2 of 4
  });

  it("stays locked after completion even when edits race the completion request", async () => {
    const c = await Client.signUp(app, "p_lock5");
    const t = await newTask(c, { title: "race" });
    const results = await Promise.all([
      c.patch(`/api/tasks/${t.id}`, { status: "COMPLETED" }),
      c.patch(`/api/tasks/${t.id}`, { title: "edited" }),
      c.patch(`/api/tasks/${t.id}`, { title: "edited again" }),
    ]);
    expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
    const final = taskSchema.parse((await c.get(`/api/tasks/${t.id}`)).body);
    expect(final.status).toBe("COMPLETED");
    expect((await c.patch(`/api/tasks/${t.id}`, { title: "too late" })).status).toBe(409);
    expect((await c.get(`/api/tasks/${t.id}`)).body.title).toBe(final.title);
  });

  it("a completed task can still be deleted deliberately", async () => {
    const c = await Client.signUp(app, "p_lock6");
    const t = await done(c);
    expect((await c.delete(`/api/tasks/${t.id}`)).status).toBe(204);
  });
});

describe("calendar deadlines (task due dates and project target dates)", () => {
  const range = (c: Client, from: string, to: string) =>
    c.get(`/api/calendar-deadlines?from=${from}&to=${to}`);

  it("returns tasks and projects whose dates fall in the range, and nothing else", async () => {
    const c = await Client.signUp(app, "p_dead1");
    const inRange = await newTask(c, { title: "in range", dueDate: "2026-11-10" });
    const onEdge = await newTask(c, { title: "on last day", dueDate: "2026-11-30" });
    await newTask(c, { title: "before", dueDate: "2026-10-31" });
    await newTask(c, { title: "after", dueDate: "2026-12-01" });
    await newTask(c, { title: "no date" });
    const completed = await newTask(c, {
      title: "done",
      dueDate: "2026-11-12",
      status: "COMPLETED",
    });
    await newTask(c, { title: "cancelled", dueDate: "2026-11-13", status: "CANCELLED" });

    const p = projectSchema.parse(
      (
        await c.post("/api/projects", {
          name: "Launch",
          targetDate: "2026-11-20",
          status: "ACTIVE",
        })
      ).body,
    );
    await c.post("/api/projects", { name: "Out of range", targetDate: "2027-01-05" });
    await c.post("/api/projects", { name: "No date" });
    await c.post("/api/projects", {
      name: "Archived one",
      targetDate: "2026-11-21",
      status: "ARCHIVED",
    });

    const res = await range(c, "2026-11-01", "2026-11-30");
    expect(res.status).toBe(200);
    // ordered by due date; cancelled, out-of-range and undated tasks are excluded; completed ones are kept
    expect(res.body.tasks.map((t: { id: string }) => t.id)).toEqual([
      inRange.id,
      completed.id,
      onEdge.id,
    ]);
    expect(res.body.projects.map((x: { id: string }) => x.id)).toEqual([p.id]); // archived/out-of-range/undated excluded
    expect(res.body.projects[0].progress).toBeDefined(); // full objects, so the calendar can open them
  });

  it("only ever returns the caller's own deadlines", async () => {
    await newTask(alice, { title: "alice deadline", dueDate: "2031-03-10" });
    await alice.post("/api/projects", { name: "alice project deadline", targetDate: "2031-03-12" });
    const mine = await range(alice, "2031-03-01", "2031-03-31");
    expect(mine.body.tasks).toHaveLength(1);
    expect(mine.body.projects).toHaveLength(1);
    const theirs = await range(bob, "2031-03-01", "2031-03-31");
    expect(theirs.body).toEqual({ tasks: [], projects: [] });
  });

  it("validates the range", async () => {
    const c = await Client.signUp(app, "p_dead2");
    expect((await range(c, "2026-11-30", "2026-11-01")).status).toBe(400);
    expect((await range(c, "2026-01-01", "2026-12-31")).status).toBe(400);
    expect((await range(c, "nope", "2026-12-31")).status).toBe(400);
    expect((await c.get("/api/calendar-deadlines")).status).toBe(400);
  });
});

describe("tenant isolation: one user can never see or change another's data", () => {
  let aliceTask: string;
  let aliceProject: string;
  let aliceEvent: string;

  beforeAll(async () => {
    aliceTask = (await newTask(alice, { title: "alice private task" })).id;
    aliceProject = projectSchema.parse(
      (await alice.post("/api/projects", { name: "alice private project", status: "ACTIVE" })).body,
    ).id;
    aliceEvent = calendarEventSchema.parse(
      (
        await alice.post("/api/calendar-events", {
          title: "alice private event",
          timeZone: "UTC",
          start: new Date(Date.now() + 3_600_000).toISOString(),
          end: new Date(Date.now() + 7_200_000).toISOString(),
        })
      ).body,
    ).id;
    await newTask(alice, { projectId: aliceProject, status: "COMPLETED" });
  });

  it("bob cannot read alice's records by id (404, not 403: existence isn't leaked)", async () => {
    expect((await bob.get(`/api/tasks/${aliceTask}`)).status).toBe(404);
    expect((await bob.get(`/api/projects/${aliceProject}`)).status).toBe(404);
    expect((await bob.get(`/api/calendar-events/${aliceEvent}`)).status).toBe(404);
  });

  it("bob cannot modify or delete alice's records, and nothing changes", async () => {
    expect(
      (await bob.patch(`/api/tasks/${aliceTask}`, { title: "hacked", status: "COMPLETED" })).status,
    ).toBe(404);
    expect((await bob.patch(`/api/projects/${aliceProject}`, { name: "hacked" })).status).toBe(404);
    expect(
      (await bob.patch(`/api/calendar-events/${aliceEvent}`, { title: "hacked" })).status,
    ).toBe(404);
    expect((await bob.delete(`/api/tasks/${aliceTask}`)).status).toBe(404);
    expect((await bob.delete(`/api/projects/${aliceProject}`)).status).toBe(404);
    expect((await bob.delete(`/api/calendar-events/${aliceEvent}`)).status).toBe(404);

    expect((await alice.get(`/api/tasks/${aliceTask}`)).body).toMatchObject({
      title: "alice private task",
      status: "TODO",
    });
    expect((await alice.get(`/api/projects/${aliceProject}`)).body.name).toBe(
      "alice private project",
    );
    expect((await alice.get(`/api/calendar-events/${aliceEvent}`)).body.title).toBe(
      "alice private event",
    );
  });

  it("bob's lists, summary and dashboard never include alice's data", async () => {
    await newTask(bob, { title: "bob task" });
    const tasks = (await bob.get("/api/tasks")).body as Array<{ id: string; title: string }>;
    expect(tasks.some((t) => t.id === aliceTask || t.title.startsWith("alice"))).toBe(false);
    expect(tasks.some((t) => t.title === "bob task")).toBe(true);

    const projects = (await bob.get("/api/projects?includeArchived=true")).body as Array<{
      name: string;
    }>;
    expect(projects.some((p) => p.name.startsWith("alice"))).toBe(false);

    const events = (
      await bob.get(
        `/api/calendar-events?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`,
      )
    ).body as unknown[];
    expect(events).toHaveLength(0);

    const dash = dashboardSchema.parse((await bob.get("/api/dashboard")).body);
    expect(dash.tasks.summary.total).toBe(1);
    expect(dash.events.upcoming).toHaveLength(0);
    expect(dash.projects.inFlight.some((p) => p.name.startsWith("alice"))).toBe(false);
  });

  it("bob cannot attach his tasks to alice's project, or move them there", async () => {
    expect((await bob.post("/api/tasks", { title: "x", projectId: aliceProject })).status).toBe(
      404,
    );
    const mine = await newTask(bob, { title: "mine" });
    expect((await bob.patch(`/api/tasks/${mine.id}`, { projectId: aliceProject })).status).toBe(
      404,
    );
    const after = (await alice.get(`/api/projects/${aliceProject}`)).body.progress;
    expect(after.total).toBe(1); // only alice's own task
  });

  it("settings are per user", async () => {
    await alice.patch("/api/settings", { timeZone: "Asia/Tokyo" });
    expect((await bob.get("/api/settings")).body).toEqual({ timeZone: null });
  });
});

describe("CSRF origin check", () => {
  it("refuses state-changing requests from other origins, and creates nothing", async () => {
    const before = await prisma.client.task.count();
    const agent = request.agent(app.getHttpServer());
    await agent
      .post("/api/auth/sign-in/username")
      .set("Origin", ORIGIN)
      .send({ username: "p_alice", password: "correct-horse-battery" });
    const evil = await agent
      .post("/api/tasks")
      .set("Origin", "http://evil.example")
      .send({ title: "forged" });
    expect(evil.status).toBe(403);
    expect(evil.body.message).toBe("Origin not allowed.");
    expect(await prisma.client.task.count()).toBe(before);

    const ok = await agent.post("/api/tasks").set("Origin", ORIGIN).send({ title: "legit" });
    expect(ok.status).toBe(201);
  });
});
