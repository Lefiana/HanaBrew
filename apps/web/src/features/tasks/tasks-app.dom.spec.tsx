import { screen, waitFor, within } from "@testing-library/react";
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
