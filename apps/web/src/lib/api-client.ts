import { apiErrorSchema, type ApiError } from "@hanabrew/contracts";
import type { z } from "zod";
import { API_URL } from "./env";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: ApiError,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/** Calls the HanaBrew API with the session cookie and validates the response against a contract. */
export async function apiFetch<S extends z.ZodType>(
  path: string,
  schema: S,
  init: RequestInit = {},
): Promise<z.infer<S>> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { Accept: "application/json", ...init.headers },
    });
  } catch {
    throw new ApiRequestError(0, "Can't reach the HanaBrew API. Is it running?");
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    throw new ApiRequestError(
      response.status,
      parsed.success ? parsed.data.message : `Request failed (${response.status}).`,
      parsed.success ? parsed.data : undefined,
    );
  }
  return schema.parse(payload);
}

/** JSON write helper (POST/PUT/PATCH/DELETE). A 204 response resolves to `undefined`: pass `z.undefined()`. */
export function apiSend<S extends z.ZodType>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  schema: S,
  body?: unknown,
): Promise<z.infer<S>> {
  return apiFetch(path, schema, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

/** Maps API validation issues to { fieldPath: message } for display next to form fields. */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  if (!(error instanceof ApiRequestError)) return {};
  return Object.fromEntries((error.body?.issues ?? []).map((issue) => [issue.path, issue.message]));
}

export function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
