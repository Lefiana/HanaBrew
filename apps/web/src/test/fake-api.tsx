import type { CalendarEvent, Dashboard, Project, Task } from "@hanabrew/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

export interface FakeDb {
  tasks: Task[];
  projects: Project[];
  events: CalendarEvent[];
  timeZone: string | null;
  dashboard?: Dashboard;
  /** Every non-GET request, in order, for assertions. */
  writes: Array<{ method: string; path: string; body: Record<string, unknown> | undefined }>;
  /** Make the next write to a path fail with this API error. */
  failNext?: { status: number; body: unknown };
}

const ISO = "2026-11-01T00:00:00.000Z";

export function task(partial: Partial<Task> & { title: string }): Task {
  return {
    id: crypto.randomUUID(),
    projectId: null,
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    dueDate: null,
    completedAt: null,
    tags: [],
    createdAt: ISO,
    updatedAt: ISO,
    ...partial,
  };
}

export function project(partial: Partial<Project> & { name: string }): Project {
  return {
    id: crypto.randomUUID(),
    description: null,
    status: "ACTIVE",
    startDate: null,
    targetDate: null,
    progress: { total: 0, todo: 0, inProgress: 0, completed: 0, cancelled: 0, percent: 0 },
    createdAt: ISO,
    updatedAt: ISO,
    ...partial,
  };
}

export function calendarEvent(
  partial: Partial<CalendarEvent> & { title: string; start: string; end: string },
): CalendarEvent {
  return {
    id: crypto.randomUUID(),
    description: null,
    category: null,
    allDay: false,
    timeZone: "UTC",
    createdAt: ISO,
    updatedAt: ISO,
    ...partial,
  };
}

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );

/** Installs a fetch that behaves like the HanaBrew API against an in-memory database. */
export function installFakeApi(db: FakeDb): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      const path = url.pathname;
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;

      if (method !== "GET") {
        db.writes.push({ method, path, body });
        if (db.failNext) {
          const failure = db.failNext;
          db.failNext = undefined;
          return json(failure.status, failure.body);
        }
      }

      if (path === "/api/tasks" && method === "GET") {
        const statuses = url.searchParams.get("status")?.split(",");
        const q = url.searchParams.get("q")?.toLowerCase();
        const projectId = url.searchParams.get("projectId");
        return json(
          200,
          db.tasks.filter(
            (t) =>
              (!statuses || statuses.includes(t.status)) &&
              (!q || t.title.toLowerCase().includes(q)) &&
              (!projectId ||
                (projectId === "none" ? t.projectId === null : t.projectId === projectId)),
          ),
        );
      }
      if (path === "/api/tasks/summary") {
        const open = db.tasks.filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS");
        const completed = db.tasks.filter((t) => t.status === "COMPLETED").length;
        const cancelled = db.tasks.filter((t) => t.status === "CANCELLED").length;
        const total = db.tasks.length;
        return json(200, {
          todo: db.tasks.filter((t) => t.status === "TODO").length,
          inProgress: db.tasks.filter((t) => t.status === "IN_PROGRESS").length,
          completed,
          cancelled,
          total,
          overdue: open.filter((t) => t.dueDate && t.dueDate < "2026-11-02").length,
          completionPercent:
            total - cancelled > 0 ? Math.round((completed / (total - cancelled)) * 100) : 0,
        });
      }
      if (path === "/api/tasks" && method === "POST") {
        const created = task({ title: String(body?.title), ...(body as object) });
        db.tasks.unshift(created);
        return json(201, created);
      }
      const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch && method === "PATCH") {
        const found = db.tasks.find((t) => t.id === taskMatch[1])!;
        Object.assign(found, body);
        return json(200, found);
      }
      if (taskMatch && method === "DELETE") {
        db.tasks = db.tasks.filter((t) => t.id !== taskMatch[1]);
        return json(204, null);
      }
      if (path === "/api/projects" && method === "GET") return json(200, db.projects);
      if (path === "/api/projects" && method === "POST") {
        const created = project({ name: String(body?.name), ...(body as object) });
        db.projects.push(created);
        return json(201, created);
      }
      const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (projectMatch && method === "PATCH") {
        const found = db.projects.find((p) => p.id === projectMatch[1])!;
        Object.assign(found, body);
        return json(200, found);
      }
      if (path === "/api/calendar-events" && method === "GET") return json(200, db.events);
      if (path === "/api/calendar-events" && method === "POST") {
        const created = calendarEvent({
          ...(body as { title: string; start: string; end: string }),
        });
        db.events.push(created);
        return json(201, created);
      }
      if (path === "/api/settings" && method === "GET") return json(200, { timeZone: db.timeZone });
      if (path === "/api/settings" && method === "PATCH") {
        db.timeZone = String(body?.timeZone);
        return json(200, { timeZone: db.timeZone });
      }
      if (path === "/api/dashboard" && db.dashboard) return json(200, db.dashboard);
      if (path === "/api/me")
        return json(200, {
          user: { id: crypto.randomUUID(), username: "hana", displayName: "Hana" },
          workspace: {
            id: crypto.randomUUID(),
            name: "Hana's workspace",
            kind: "PERSONAL",
            role: "OWNER",
          },
        });
      return json(404, {
        statusCode: 404,
        error: "NOT_FOUND",
        message: `unhandled ${method} ${path}`,
      });
    }),
  );
}

export function newDb(partial: Partial<FakeDb> = {}): FakeDb {
  return { tasks: [], projects: [], events: [], timeZone: "Asia/Manila", writes: [], ...partial };
}

export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
