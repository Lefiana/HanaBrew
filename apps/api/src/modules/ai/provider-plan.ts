import {
  isCloudProvider,
  type AiProviderId,
  type AiSettings,
  type ProviderStatus,
} from "@hanabrew/contracts";

const LABELS: Record<AiProviderId, string> = { GEMINI: "Gemini", GROQ: "Groq", OLLAMA: "Ollama" };
const DEFAULT_ORDER: AiProviderId[] = ["GEMINI", "GROQ", "OLLAMA"];

export const providerLabel = (provider: AiProviderId): string => LABELS[provider];

export interface ProviderPlan {
  primary: AiProviderId | null;
  fallback: AiProviderId | null;
  /** Why there is no primary provider (shown to the user). */
  problem?: string;
}

/**
 * Which provider answers, and which (if any) may take over when the first is down.
 *  - A preferred provider is ALWAYS honoured. If it isn't ready we stop and say so; we never quietly switch to
 *    another one, because that could send private data to a cloud service the user didn't choose.
 *  - With no preference, the first ready provider in a fixed order is used.
 *  - A fallback is only used if it is ready AND (it runs locally OR the user explicitly allowed cloud fallback).
 */
export function planProviders(statuses: ProviderStatus[], settings: AiSettings): ProviderPlan {
  const ready = (provider: AiProviderId) =>
    statuses.find((s) => s.provider === provider)?.ready === true;

  let primary: AiProviderId | null;
  if (settings.preferredProvider) {
    if (!ready(settings.preferredProvider)) {
      return {
        primary: null,
        fallback: null,
        problem: `Your preferred provider (${LABELS[settings.preferredProvider]}) isn't ready. Add its key or choose a model in Settings → AI.`,
      };
    }
    primary = settings.preferredProvider;
  } else {
    primary = DEFAULT_ORDER.find(ready) ?? null;
    if (!primary)
      return {
        primary: null,
        fallback: null,
        problem: "No AI provider is set up yet. Open Settings → AI to add one.",
      };
  }

  const candidate = settings.fallbackProvider;
  const fallback =
    candidate &&
    candidate !== primary &&
    ready(candidate) &&
    (!isCloudProvider(candidate) || settings.allowCloudFallback)
      ? candidate
      : null;
  return { primary, fallback };
}
