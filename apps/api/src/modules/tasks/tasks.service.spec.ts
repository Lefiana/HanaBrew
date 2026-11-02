import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { TasksService } from "./tasks.service.js";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";

function row(status: "TODO" | "COMPLETED" | "IN_PROGRESS" | "CANCELLED") {
  const now = new Date("2026-11-02T00:00:00Z");
  return {
    id: TASK_ID,
    workspaceId: WORKSPACE,
    projectId: null,
    title: "t",
    description: null,
    status,
    priority: "MEDIUM",
    dueDate: null,
    completedAt: status === "COMPLETED" ? now : null,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

function serviceWith(existing: ReturnType<typeof row> | null, updateCount = 1) {
  const db = {
    task: {
      findFirst: vi.fn().mockResolvedValue(existing),
      updateMany: vi.fn().mockResolvedValue({ count: updateCount }),
    },
    project: { count: vi.fn().mockResolvedValue(1) },
  };
  return { db, service: new TasksService({ client: db } as never) };
}

describe("TasksService.update: completed-task lock", () => {
  it("never writes when a completed task is edited", async () => {
    const { db, service } = serviceWith(row("COMPLETED"));
    await expect(service.update(WORKSPACE, TASK_ID, { title: "x" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      service.update(WORKSPACE, TASK_ID, { status: "CANCELLED" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.task.updateMany).not.toHaveBeenCalled();
  });

  it("treats repeating COMPLETED as a no-op without writing", async () => {
    const { db, service } = serviceWith(row("COMPLETED"));
    await expect(
      service.update(WORKSPACE, TASK_ID, { status: "COMPLETED" }),
    ).resolves.toMatchObject({ status: "COMPLETED" });
    expect(db.task.updateMany).not.toHaveBeenCalled();
  });

  it("a reopen is written conditionally on the task still being COMPLETED", async () => {
    const { db, service } = serviceWith(row("COMPLETED"));
    db.task.findFirst.mockResolvedValueOnce(row("COMPLETED")).mockResolvedValueOnce(row("TODO"));
    await service.update(WORKSPACE, TASK_ID, { status: "TODO" });
    expect(db.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TASK_ID, workspaceId: WORKSPACE, status: "COMPLETED" },
      }),
    );
  });
});

describe("TasksService.update: lost-update guard", () => {
  it("writes only if the status is still what was validated, and reports a conflict when it changed", async () => {
    // The task was TODO when read, but another request completed it before our write landed.
    const { db, service } = serviceWith(row("TODO"), 0);
    await expect(service.update(WORKSPACE, TASK_ID, { title: "late edit" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TASK_ID, workspaceId: WORKSPACE, status: "TODO" } }),
    );
  });

  it("404s for a task outside the workspace without writing", async () => {
    const { db, service } = serviceWith(null);
    await expect(service.update(WORKSPACE, TASK_ID, { title: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.task.updateMany).not.toHaveBeenCalled();
  });
});
