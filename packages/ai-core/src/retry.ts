import { ProviderError } from "./errors.js";

export interface RetryOptions {
  /** Extra attempts after the first (default 2). */
  retries?: number;
  /** First delay in ms; later delays grow ×3 (default 700, so 700 then 2100). */
  baseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Providers sometimes answer 503/429 for a moment ("model is overloaded"). A short pause usually clears it. */
export async function retryTransient<T>(
  work: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 2;
  const base = options.baseMs ?? 700;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      const transient =
        error instanceof ProviderError &&
        (error.kind === "unavailable" || error.kind === "rate_limit");
      if (!transient || attempt >= retries) throw error;
      await sleep(base * 3 ** attempt);
    }
  }
}
