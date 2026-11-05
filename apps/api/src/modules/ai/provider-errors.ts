import { HttpException, HttpStatus } from "@nestjs/common";
import { ProviderError } from "@hanabrew/ai-core";

/**
 * Maps a provider failure onto an HTTP error whose message is kept (the global filter hides 5xx messages, so we
 * use 4xx statuses here: the message is the actionable part). 422 = fix your setup, 424 = the provider is down.
 */
export function toHttpError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  if (error instanceof ProviderError) {
    const status =
      error.kind === "rate_limit"
        ? HttpStatus.TOO_MANY_REQUESTS
        : error.kind === "unavailable" ||
            error.kind === "timeout" ||
            error.kind === "invalid_response"
          ? HttpStatus.FAILED_DEPENDENCY
          : HttpStatus.UNPROCESSABLE_ENTITY;
    return new HttpException(error.message, status);
  }
  return new HttpException(
    "Something went wrong talking to the AI provider.",
    HttpStatus.FAILED_DEPENDENCY,
  );
}

export function friendlyMessage(error: unknown): string {
  return error instanceof ProviderError
    ? error.message
    : error instanceof HttpException
      ? error.message
      : "an unexpected error";
}
