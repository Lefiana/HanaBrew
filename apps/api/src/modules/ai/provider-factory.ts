import { GeminiProvider, GroqProvider, OllamaProvider, type AIProvider } from "@hanabrew/ai-core";
import type { AiProviderId } from "@hanabrew/contracts";

export const AI_PROVIDER_FACTORY = Symbol("AI_PROVIDER_FACTORY");

export interface ProviderBuildOptions {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  timeoutMs: number;
}
export type ProviderFactory = (provider: AiProviderId, options: ProviderBuildOptions) => AIProvider;

/** Builds the real adapter. Replaced by a scripted provider in tests. */
export const defaultProviderFactory: ProviderFactory = (
  provider,
  { apiKey, baseUrl, timeoutMs },
) => {
  switch (provider) {
    case "GEMINI":
      return new GeminiProvider(apiKey ?? "", { timeoutMs });
    case "GROQ":
      return new GroqProvider(apiKey ?? "", { timeoutMs });
    case "OLLAMA":
      return new OllamaProvider({ ...(baseUrl ? { baseUrl } : {}), timeoutMs });
  }
};
