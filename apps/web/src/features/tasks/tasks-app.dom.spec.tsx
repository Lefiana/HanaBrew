import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi, newDb, renderWithQuery, task } from "@/test/fake-api";
import { TasksApp } from "./tasks-app";

describe("TasksApp", () => {
  it("lists tasks with priority, due date and tags, and shows overall progress", async () => {
    const db = newDb({
      tasks: [
        task({ title: "Roast beans", priority: "URGENT", tags: ["coffee"], dueDate: "2020-01-01" }),
        task({ title: "Write notes", status: "IN_PROGRESS" }),
        task({ title: "Done thing", status: "COMPLETED" }),
      ],
    });
    installFakeApi(db);
    renderWithQuery(<TasksApp />);

    const list = await screen.findByRole("list", { name: "Tasks" });
    expect(within(list).getByText("Roast beans")).toBeInTheDocument();
    expect(within(list).getByText("Urgent")).toBeInTheDocument();
    expect(within(list).getByText("#coffee")).toBeInTheDocument();
    expect(within(list).getByText(/Overdue/)).toBeInTheDocument();
    // the Active view hides the completed task
    expect(within(list).queryByText("Done thing")).not.toBeInTheDocument();
    expect(await screen.findByText(/1 of 3 done/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Overall task completion" })).toHaveAttribute(
      "aria-valuenow",
      "33",
    );
  });

  it("quick-adds a task, clears the box and shows the new task", async () => {
    const db = newDb();
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<TasksApp />);

    const box = await screen.findByLabelText("Quick add a task");
    await user.type(box, "Buy oat milk{Enter}");

    expect(await screen.findByText("Buy oat milk")).toBeInTheDocument();
    expect(box).toHaveValue("");
    expect(db.writes).toEqual([
      { method: "POST", path: "/api/tasks", body: { title: "Buy oat milk" } },
    ]);
  });

  it("completes a task via its checkbox", async () => {
    const db = newDb({ tasks: [task({ title: "Water plants" })] });
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<TasksApp />);

    await user.click(await screen.findByRole("checkbox", { name: /Complete “Water plants”/ }));
    await waitFor(() =>
      expect(db.writes[0]).toMatchObject({ method: "PATCH", body: { status: "COMPLETED" } }),
    );
  });

  it("edits a task and sends only valid, normalised values", async () => {
    const db = newDb({ tasks: [task({ title: "Old title" })] });
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<TasksApp />);

    await user.click(await screen.findByText("Old title"));
    const title = await screen.findByLabelText("Title");
    await user.clear(title);
    await user.type(title, "New title");
    await user.type(screen.getByLabelText("Tags"), "Work, #urgent");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(db.writes).toHaveLength(1));
    expect(db.writes[0]).toMatchObject({
      method: "PATCH",
      body: {
        title: "New title",
        tags: ["Work", "urgent"],
        dueDate: null,
        projectId: null,
        description: null,
        status: "TODO",
      },
    });
    expect(await screen.findByRole("list", { name: "Tasks" })).toBeInTheDocument(); // back on the list
  });

  it("shows API validation errors next to the field", async () => {
    const db = newDb();
    db.failNext = undefined;
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<TasksApp />);

    await user.click(await screen.findByRole("button", { name: "Details…" }));
    await user.type(await screen.findByLabelText("Title"), "x");
    db.failNext = {
      status: 400,
      body: {
        statusCode: 400,
        error: "BAD_REQUEST",
        message: "Validation failed.",
        issues: [{ path: "dueDate", message: "Invalid date" }],
      },
    };
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByText("Invalid date")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument(); // form stays open
  });

  it("shows a friendly empty state", async () => {
    installFakeApi(newDb());
    renderWithQuery(<TasksApp />);
    expect(await screen.findByText(/Nothing to do/)).toBeInTheDocument();
  });
});

describe("TasksApp: whole card opens the task", () => {
  it("clicking anywhere on a card (not just the title) opens the editor", async () => {
    installFakeApi(
      newDb({ tasks: [task({ title: "Roast beans", priority: "HIGH", dueDate: "2030-01-01" })] }),
    );
    const user = userEvent.setup();
    renderWithQuery(<TasksApp />);

    const list = await screen.findByRole("list", { name: "Tasks" });
    await user.click(within(list).getByText("High")); // the priority badge, far from the title
    expect(await screen.findByRole("heading", { name: "Edit task" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Roast beans");
  });

  it("the card is also reachable from the keyboard through its title button", async () => {
    installFakeApi(newDb({ tasks: [task({ title: "Roast beans" })] }));
    const user = userEvent.setup();
    renderWithQuery(<TasksApp />);

    const title = await screen.findByRole("button", { name: "Roast beans" });
    title.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Edit task" })).toBeInTheDocument();
  });

  it("the checkbox and tag chips do their own thing without opening the task", async () => {
    const db = newDb({ tasks: [task({ title: "Roast beans", tags: ["coffee"] })] });
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<TasksApp />);

    await user.click(await screen.findByText("#coffee"));
    expect(await screen.findByLabelText("Clear tag filter")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Edit task" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Complete “Roast beans”/ }));
    await waitFor(() =>
      expect(db.writes[0]).toMatchObject({ method: "PATCH", body: { status: "COMPLETED" } }),
    );
    expect(screen.queryByRole("heading", { name: "Edit task" })).not.toBeInTheDocument();
  });
});

describe("TasksApp: completed tasks are locked", () => {
  const completed = () =>
    task({
      title: "Shipped it",
      status: "COMPLETED",
      priority: "HIGH",
      tags: ["launch"],
      description: "All done",
      completedAt: "2026-11-01T08:00:00.000Z",
    });

  async function openCompletedTab(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("tab", { name: "Completed" }));
    return screen.findByRole("list", { name: "Tasks" });
  }

  it("shows a locked, disabled checkbox so a completed task can't be un-ticked from the list", async () => {
    const db = newDb({ tasks: [completed()] });
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<TasksApp />);

    const list = await openCompletedTab(user);
    const checkbox = within(list).getByRole("checkbox", { name: /completed and locked/ });
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
    await user.click(checkbox);
    expect(db.writes).toHaveLength(0);
  });

  it("opens read-only: no editable fields and no Save button", async () => {
    installFakeApi(newDb({ tasks: [completed()] }));
    const user = userEvent.setup();
    renderWithQuery(<TasksApp />);

    await user.click(within(await openCompletedTab(user)).getByText("Shipped it"));
    expect(await screen.findByRole("heading", { name: "Completed task" })).toBeInTheDocument();
    expect(screen.getByText(/locked and can’t be edited/)).toBeInTheDocument();
    expect(screen.getByText("Shipped it")).toBeInTheDocument();
    expect(screen.getByText("All done")).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("reopening needs an explicit confirmation, then sends only the status change", async () => {
    const db = newDb({ tasks: [completed()] });
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<TasksApp />);

    await user.click(within(await openCompletedTab(user)).getByText("Shipped it"));
    await user.click(await screen.findByRole("button", { name: "Reopen task…" }));
    expect(await screen.findByText("Reopen this task?")).toBeInTheDocument();
    expect(db.writes).toHaveLength(0); // nothing happens until confirmed

    await user.click(screen.getByRole("button", { name: "Yes, reopen" }));
    await waitFor(() => expect(db.writes).toHaveLength(1));
    expect(db.writes[0]).toMatchObject({ method: "PATCH", body: { status: "TODO" } });
    expect(Object.keys(db.writes[0]!.body!)).toEqual(["status"]);
  });

  it("'Keep it completed' backs out without writing anything", async () => {
    const db = newDb({ tasks: [completed()] });
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<TasksApp />);

    await user.click(within(await openCompletedTab(user)).getByText("Shipped it"));
    await user.click(await screen.findByRole("button", { name: "Reopen task…" }));
    await user.click(screen.getByRole("button", { name: "Keep it completed" }));
    expect(screen.getByRole("button", { name: "Reopen task…" })).toBeInTheDocument();
    expect(db.writes).toHaveLength(0);
  });

  it("completing a task from the editor tells the user it will lock", async () => {
    installFakeApi(newDb({ tasks: [task({ title: "Almost" })] }));
    const user = userEvent.setup();
    renderWithQuery(<TasksApp />);

    await user.click(await screen.findByText("Almost"));
    await user.selectOptions(await screen.findByLabelText("Status"), "COMPLETED");
    expect(screen.getByText(/locked until you reopen/)).toBeInTheDocument();
  });

  it("deleting a completed task also asks first", async () => {
    const db = newDb({ tasks: [completed()] });
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<TasksApp />);

    await user.click(within(await openCompletedTab(user)).getByText("Shipped it"));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(db.writes).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(db.writes[0]).toMatchObject({ method: "DELETE" }));
    void fireEvent;
  });
});
