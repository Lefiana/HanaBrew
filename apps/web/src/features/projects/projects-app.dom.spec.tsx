import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi, newDb, project, renderWithQuery, task } from "@/test/fake-api";
import { ProjectsApp } from "./projects-app";

const progress = { total: 5, todo: 1, inProgress: 1, completed: 2, cancelled: 1, percent: 50 };

describe("ProjectsApp", () => {
  it("lists projects with server-calculated progress, hiding archived ones by default", async () => {
    installFakeApi(
      newDb({
        projects: [
          project({ name: "Cafe launch", progress }),
          project({ name: "Old thing", status: "ARCHIVED" }),
        ],
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<ProjectsApp />);

    const list = await screen.findByRole("list", { name: "Projects" });
    expect(within(list).getByText("Cafe launch")).toBeInTheDocument();
    expect(within(list).getByText(/50% · 2 of 4 tasks done/)).toBeInTheDocument();
    expect(within(list).queryByText("Old thing")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Show archived"));
    expect(await screen.findByText("Old thing")).toBeInTheDocument();
  });

  it("opens a project to show its tasks and progress, and adds a task to it", async () => {
    const p = project({ name: "Cafe launch", progress });
    const db = newDb({
      projects: [p],
      tasks: [task({ title: "Pick a menu", projectId: p.id }), task({ title: "Unrelated" })],
    });
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<ProjectsApp />);

    await user.click(await screen.findByText("Cafe launch"));
    const tasks = await screen.findByRole("list", { name: "Project tasks" });
    expect(within(tasks).getByText("Pick a menu")).toBeInTheDocument();
    expect(within(tasks).queryByText("Unrelated")).not.toBeInTheDocument();
    expect(screen.getByText("50% complete")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Add a task to this project"), "Hire barista{Enter}");
    await waitFor(() =>
      expect(db.writes[0]).toMatchObject({
        method: "POST",
        path: "/api/tasks",
        body: { title: "Hire barista", projectId: p.id },
      }),
    );
  });

  it("archives a project from its detail view", async () => {
    const p = project({ name: "Side quest" });
    const db = newDb({ projects: [p] });
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<ProjectsApp />);

    await user.click(await screen.findByText("Side quest"));
    await user.click(await screen.findByRole("button", { name: /Archive/ }));
    await waitFor(() =>
      expect(db.writes[0]).toMatchObject({ method: "PATCH", body: { status: "ARCHIVED" } }),
    );
  });

  it("creates a project and shows date errors from the API next to the field", async () => {
    const db = newDb();
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<ProjectsApp />);

    await user.click(await screen.findByRole("button", { name: /New project/ }));
    await user.type(await screen.findByLabelText("Name"), "Launch");
    db.failNext = {
      status: 400,
      body: {
        statusCode: 400,
        error: "BAD_REQUEST",
        message: "Validation failed.",
        issues: [
          { path: "targetDate", message: "The target date can't be before the start date." },
        ],
      },
    };
    await user.click(screen.getByRole("button", { name: "Create project" }));
    expect(await screen.findByText(/target date can't be before/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create project" }));
    expect(await screen.findByRole("heading", { name: "Launch" })).toBeInTheDocument(); // moved on to the detail view
  });
});
