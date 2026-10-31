import { describe, expect, it, vi } from "vitest";
import { HealthService } from "./health.service.js";

const prismaWith = (queryRaw: () => Promise<unknown>) =>
  ({ client: { $queryRaw: queryRaw } }) as never;

describe("HealthService.readiness", () => {
  it("reports ok when the database answers", async () => {
    const service = new HealthService(prismaWith(() => Promise.resolve([{ "?column?": 1 }])));
    await expect(service.readiness()).resolves.toEqual({
      status: "ok",
      checks: { database: "up" },
    });
  });

  it("reports degraded when the database errors", async () => {
    const service = new HealthService(prismaWith(() => Promise.reject(new Error("ECONNREFUSED"))));
    await expect(service.readiness()).resolves.toEqual({
      status: "degraded",
      checks: { database: "down" },
    });
  });

  it("reports degraded when the database hangs", async () => {
    vi.useFakeTimers();
    try {
      const service = new HealthService(prismaWith(() => new Promise(() => undefined)));
      const pending = service.readiness();
      await vi.advanceTimersByTimeAsync(2_100);
      await expect(pending).resolves.toMatchObject({ status: "degraded" });
    } finally {
      vi.useRealTimers();
    }
  });
});
