import { ProviderError, redact } from "./errors.js";
import type { ProviderId } from "./types.js";

export interface RequestOptions {
  provider: ProviderId;
  fetch?: typeof fetch | undefined;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
  maxResponseBytes?: number;
  /** Values (API keys) that must never appear in an error message. */
  secrets?: string[];
}

export interface JsonResponse {
  status: number;
  ok: boolean;
  data: unknown;
}

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

/** One JSON request with a timeout, a response-size cap and consistent error mapping for transport failures. */
export async function requestJson(
  url: string,
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: unknown },
  options: RequestOptions,
): Promise<JsonResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), options.timeoutMs);
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const secrets = options.secrets ?? [];
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "the AI provider";
    }
  })();

  try {
    const doFetch = options.fetch ?? fetch;
    const response = await doFetch(url, {
      method: init.method,
      headers: init.headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: controller.signal,
    });
    const text = await readLimited(
      response,
      options.maxResponseBytes ?? DEFAULT_MAX_BYTES,
      options.provider,
    );
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = { raw: redact(text.slice(0, 300), secrets) };
    }
    return { status: response.status, ok: response.ok, data };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const timedOut =
      controller.signal.aborted && String(controller.signal.reason).includes("timeout");
    if (timedOut)
      throw new ProviderError("timeout", `${host} didn't answer in time.`, options.provider);
    if (options.signal?.aborted) throw error;
    throw new ProviderError(
      "unavailable",
      `Can't reach ${host}. Is it running and reachable?`,
      options.provider,
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

async function readLimited(
  response: Response,
  maxBytes: number,
  provider: ProviderId,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ProviderError(
        "invalid_response",
        "The AI provider sent an unexpectedly large response.",
        provider,
      );
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Pulls a human-readable message from the common `{ error: { message } }` / `{ error: "..." }` shapes. */
export function errorMessageFrom(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const error = (data as { error?: unknown }).error;
    if (typeof error === "string") return error;
    if (
      error &&
      typeof error === "object" &&
      typeof (error as { message?: unknown }).message === "string"
    ) {
      return (error as { message: string }).message;
    }
  }
  return fallback;
}
