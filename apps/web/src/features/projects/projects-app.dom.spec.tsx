import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

  it("opens a project to show its tasks and progress", async () => {
    const p = project({ name: "Cafe launch", progress });
    installFakeApi(
      newDb({
        projects: [p],
        tasks: [task({ title: "Pick a menu", projectId: p.id }), task({ title: "Unrelated" })],
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<ProjectsApp />);

    await user.click(await screen.findByText("Cafe launch"));
    const tasks = await screen.findByRole("list", { name: "Project tasks" });
    expect(within(tasks).getByText("Pick a menu")).toBeInTheDocument();
    expect(within(tasks).queryByText("Unrelated")).not.toBeInTheDocument();
    expect(screen.getByText("50% complete")).toBeInTheDocument();
    expect(screen.getByText(/Cancelled tasks aren’t counted towards progress/)).toBeInTheDocument();
  });

  it("'New task' opens the FULL task form with this project preselected, and saves every field in one go", async () => {
    const p = project({ name: "Cafe launch", progress });
    const db = newDb({ projects: [p, project({ name: "Other" })] });
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<ProjectsApp />);

    await user.click(await screen.findByText("Cafe launch"));
    expect(screen.queryByLabelText("Add a task to this project")).not.toBeInTheDocument(); // no title-only quick add any more
    await user.click(await screen.findByRole("button", { name: /New task/ }));

    expect(await screen.findByRole("heading", { name: "New task" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project")).toHaveValue(p.id); // preselected
    for (const field of ["Title", "Description", "Status", "Priority", "Due date", "Tags"]) {
      expect(screen.getByLabelText(field)).toBeInTheDocument(); // everything is available upfront
    }

    await user.type(screen.getByLabelText("Title"), "Hire barista");
    await user.type(screen.getByLabelText("Description"), "Interview three people");
    await user.selectOptions(screen.getByLabelText("Priority"), "HIGH");
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2030-12-01" } });
    await user.type(screen.getByLabelText("Tags"), "staff, hiring");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(db.writes).toHaveLength(1));
    expect(db.writes[0]).toMatchObject({
      method: "POST",
      path: "/api/tasks",
      body: {
        title: "Hire barista",
        description: "Interview three people",
        status: "TODO",
        priority: "HIGH",
        dueDate: "2030-12-01",
        projectId: p.id,
        tags: ["staff", "hiring"],
      },
    });
    expect(await screen.findByRole("heading", { name: "Cafe launch" })).toBeInTheDocument(); // back on the project
  });

  it("cancelling the new-task form returns to the project without saving", async () => {
    const p = project({ name: "Cafe launch" });
    const db = newDb({ projects: [p] });
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<ProjectsApp />);

    await user.click(await screen.findByText("Cafe launch"));
    await user.click(await screen.findByRole("button", { name: /New task/ }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("heading", { name: "Cafe launch" })).toBeInTheDocument();
    expect(db.writes).toHaveLength(0);
  });

  it("a completed task inside a project opens locked", async () => {
    const p = project({ name: "Cafe launch" });
    installFakeApi(
      newDb({
        projects: [p],
        tasks: [task({ title: "Done deal", projectId: p.id, status: "COMPLETED" })],
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<ProjectsApp />);

    await user.click(await screen.findByText("Cafe launch"));
    await user.click(await screen.findByText("Done deal"));
    expect(await screen.findByRole("heading", { name: "Completed task" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
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
