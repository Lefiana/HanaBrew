import { describe, expect, it } from "vitest";
import { ProviderError } from "./errors.js";
import { retryTransient } from "./retry.js";

const down = () => new ProviderError("unavailable", "overloaded", "gemini", 503);
const auth = () => new ProviderError("auth", "bad key", "gemini", 401);

describe("retryTransient", () => {
  it("retries a transient failure with growing pauses and then succeeds", async () => {
    const pauses: number[] = [];
    let calls = 0;
    const result = await retryTransient(
      async () => {
        calls += 1;
        if (calls < 3) throw down();
        return "ok";
      },
      { sleep: async (ms) => void pauses.push(ms) },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(pauses).toEqual([700, 2100]);
  });

  it("gives up after the configured number of retries, with the last error", async () => {
    let calls = 0;
    await expect(
      retryTransient(
        async () => {
          calls += 1;
          throw down();
        },
        { retries: 1, sleep: async () => undefined },
      ),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect(calls).toBe(2);
  });

  it("never retries problems a retry can't fix (bad key, bad request) or non-provider errors", async () => {
    let calls = 0;
    await expect(
      retryTransient(
        async () => {
          calls += 1;
          throw auth();
        },
        { sleep: async () => undefined },
      ),
    ).rejects.toMatchObject({ kind: "auth" });
    expect(calls).toBe(1);
    await expect(
      retryTransient(
        async () => {
          throw new Error("boom");
        },
        { sleep: async () => undefined },
      ),
    ).rejects.toThrow("boom");
  });

  it("retries rate limits too, and zero retries means a single attempt", async () => {
    let calls = 0;
    await expect(
      retryTransient(
        async () => {
          calls += 1;
          throw new ProviderError("rate_limit", "slow down", "groq", 429);
        },
        { retries: 0, sleep: async () => undefined },
      ),
    ).rejects.toBeDefined();
    expect(calls).toBe(1);
  });
});
