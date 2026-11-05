import type { ProviderId } from "./types.js";

export type ProviderErrorKind =
  | "auth"
  | "rate_limit"
  | "unavailable"
  | "timeout"
  | "bad_request"
  | "model_not_found"
  | "unsupported_tools"
  | "invalid_response";

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly provider: ProviderId,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  /** Failures where trying another provider is sensible (the provider itself is down or busy). */
  get fallbackEligible(): boolean {
    return this.kind === "unavailable" || this.kind === "timeout" || this.kind === "rate_limit";
  }
}

/** Removes secrets from any text that might be shown or logged. */
export function redact(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) if (secret.length >= 6) out = out.split(secret).join("[redacted]");
  return out;
}
