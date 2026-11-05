export type JsonObject = Record<string, unknown>;
export type ProviderId = "gemini" | "groq" | "ollama";

/** A tool the model may call. `parameters` is a JSON Schema object (already simplified for providers). */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonObject;
}

export interface ToolCall {
  /** Stable id. Providers that don't issue ids (Gemini, Ollama) get one generated here. */
  id: string;
  name: string;
  args: JsonObject;
  /** Set when the model's arguments couldn't be parsed; the call must not be executed. */
  argsError?: string;
}

/** Opaque, provider-specific data that must be echoed back verbatim (e.g. Gemini thought signatures). */
export interface ProviderState {
  provider: ProviderId;
  data: unknown;
}

export type AIMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls?: ToolCall[];
      providerState?: ProviderState | undefined;
    }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface AIRequest {
  model: string;
  system: string;
  messages: AIMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export type FinishReason = "stop" | "tool_calls" | "length" | "blocked" | "other";

export interface AIResponse {
  text: string;
  toolCalls: ToolCall[];
  providerState?: ProviderState;
  finishReason: FinishReason;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface AIProvider {
  readonly id: ProviderId;
  generateResponse(request: AIRequest): Promise<AIResponse>;
  /** Models this credential can use (live from the provider, so nothing is hard-coded and stale). */
  listModels(signal?: AbortSignal): Promise<string[]>;
  /** Streaming is part of the contract but not implemented by any adapter yet. */
  streamResponse?(request: AIRequest): AsyncIterable<{ text: string }>;
}

export interface ProviderOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}
