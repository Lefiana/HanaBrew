import type { Dashboard } from "@hanabrew/contracts";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  calendarEvent,
  installFakeApi,
  newDb,
  project,
  renderWithQuery,
  task,
} from "@/test/fake-api";
import { DashboardWidgets } from "./dashboard-widgets";

function dashboard(partial: Partial<Dashboard> = {}): Dashboard {
  return {
    today: "2026-11-02",
    timeZone: "Asia/Manila",
    tasks: {
      summary: {
        todo: 3,
        inProgress: 1,
        completed: 4,
        cancelled: 0,
        total: 8,
        overdue: 2,
        completionPercent: 50,
      },
      dueSoon: [
        task({ title: "Late thing", dueDate: "2026-10-30" }),
        task({ title: "Soon thing", dueDate: "2026-11-05" }),
      ],
    },
    events: {
      upcoming: [
        calendarEvent({
          title: "Standup",
          start: "2099-01-01T01:00:00.000Z",
          end: "2099-01-01T02:00:00.000Z",
        }),
        calendarEvent({
          title: "Holiday",
          allDay: true,
          start: "2026-11-02T00:00:00.000Z",
          end: "2026-11-03T00:00:00.000Z",
        }),
      ],
    },
    projects: {
      inFlight: [
        project({
          name: "Cafe launch",
          progress: { total: 5, todo: 1, inProgress: 1, completed: 2, cancelled: 1, percent: 50 },
        }),
      ],
    },
    ...partial,
  };
}

describe("DashboardWidgets", () => {
  it("renders server-calculated metrics, due tasks, upcoming events and project progress", async () => {
    installFakeApi(newDb({ dashboard: dashboard() }));
    renderWithQuery(<DashboardWidgets />);

    expect(await screen.findByRole("img", { name: "50% of tasks complete" })).toBeInTheDocument();
    expect(screen.getByText("4 to go")).toBeInTheDocument();
    expect(screen.getByText("2 overdue")).toBeInTheDocument();
    expect(screen.getByText("Late thing")).toBeInTheDocument();
    expect(screen.getByText("Standup")).toBeInTheDocument();
    expect(screen.getByText("Today · all day")).toBeInTheDocument();
    expect(screen.getByText("Cafe launch")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Cafe launch progress" })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
  });

  it("shows calm empty states", async () => {
    installFakeApi(
      newDb({
        dashboard: dashboard({
          tasks: {
            summary: {
              todo: 0,
              inProgress: 0,
              completed: 0,
              cancelled: 0,
              total: 0,
              overdue: 0,
              completionPercent: 0,
            },
            dueSoon: [],
          },
          events: { upcoming: [] },
          projects: { inFlight: [] },
        }),
      }),
    );
    renderWithQuery(<DashboardWidgets />);
    expect(await screen.findByText("All clear")).toBeInTheDocument();
    expect(screen.getByText("Nothing scheduled.")).toBeInTheDocument();
    expect(screen.getByText("No projects in flight.")).toBeInTheDocument();
  });

  it("degrades gracefully when the API is down", async () => {
    installFakeApi(newDb()); // no dashboard -> 404
    renderWithQuery(<DashboardWidgets />);
    expect(await screen.findByText(/unavailable/)).toBeInTheDocument();
  });
});
