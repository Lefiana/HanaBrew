import { ProviderError, redact } from "./errors.js";
import { errorMessageFrom, requestJson } from "./http.js";
import type {
  AIMessage,
  AIProvider,
  AIRequest,
  AIResponse,
  FinishReason,
  JsonObject,
  ProviderOptions,
  ToolCall,
} from "./types.js";

const DEFAULT_BASE = "https://api.groq.com/openai/v1";

export class GroqProvider implements AIProvider {
  readonly id = "groq" as const;
  private readonly base: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly apiKey: string,
    private readonly options: ProviderOptions = {},
  ) {
    this.base = (options.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    const res = await requestJson(
      `${this.base}/chat/completions`,
      { method: "POST", headers: this.headers(), body: buildBody(request) },
      {
        provider: this.id,
        fetch: this.options.fetch,
        timeoutMs: this.timeoutMs,
        signal: request.signal,
        secrets: [this.apiKey],
      },
    );
    if (!res.ok) throw mapError(res.status, res.data, this.apiKey);
    return parseResponse(res.data);
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const res = await requestJson(
      `${this.base}/models`,
      { method: "GET", headers: this.headers() },
      {
        provider: this.id,
        fetch: this.options.fetch,
        timeoutMs: this.timeoutMs,
        signal,
        secrets: [this.apiKey],
      },
    );
    if (!res.ok) throw mapError(res.status, res.data, this.apiKey);
    const models = (res.data as { data?: Array<{ id?: string }> }).data ?? [];
    return models
      .map((m) => m.id ?? "")
      .filter((id) => id && !/whisper|tts|playai|guard/i.test(id))
      .sort();
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" };
  }
}

export function toMessages(system: string, messages: AIMessage[]): JsonObject[] {
  const out: JsonObject[] = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "user") out.push({ role: "user", content: message.content });
    else if (message.role === "tool")
      out.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        name: message.name,
        content: message.content,
      });
    else if (message.toolCalls?.length) {
      out.push({
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.args) },
        })),
      });
    } else out.push({ role: "assistant", content: message.content });
  }
  return out;
}

export function buildBody(request: AIRequest): JsonObject {
  const body: JsonObject = {
    model: request.model,
    messages: toMessages(request.system, request.messages),
  };
  if (request.tools?.length) {
    body.tools = request.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxOutputTokens !== undefined) body.max_completion_tokens = request.maxOutputTokens;
  return body;
}

export function parseResponse(data: unknown): AIResponse {
  const body = (data ?? {}) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
      };
      finish_reason?: string;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = body.choices?.[0];
  if (!choice?.message)
    throw new ProviderError("invalid_response", "Groq returned no answer.", "groq");

  const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((call, index) => {
    const base = {
      id: call.id || `call_${index}_${Date.now().toString(36)}`,
      name: call.function?.name ?? "",
    };
    // Models sometimes emit malformed arguments; report that instead of guessing.
    try {
      const parsed: unknown = JSON.parse(call.function?.arguments || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return { ...base, args: parsed as JsonObject };
      return { ...base, args: {}, argsError: "Tool arguments must be a JSON object." };
    } catch {
      return { ...base, args: {}, argsError: "Tool arguments were not valid JSON." };
    }
  });
  return {
    text: choice.message.content ?? "",
    toolCalls,
    finishReason: toolCalls.length ? "tool_calls" : mapFinish(choice.finish_reason),
    usage: {
      ...(body.usage?.prompt_tokens === undefined ? {} : { inputTokens: body.usage.prompt_tokens }),
      ...(body.usage?.completion_tokens === undefined
        ? {}
        : { outputTokens: body.usage.completion_tokens }),
    },
  };
}

function mapFinish(reason: string | undefined): FinishReason {
  if (!reason || reason === "stop") return "stop";
  if (reason === "length") return "length";
  if (reason === "content_filter") return "blocked";
  return "other";
}

function mapError(status: number, data: unknown, apiKey: string): ProviderError {
  const message = redact(errorMessageFrom(data, `Groq returned HTTP ${status}.`), [apiKey]);
  const code = (data as { error?: { code?: string } } | undefined)?.error?.code;
  if (status === 401 || status === 403)
    return new ProviderError(
      "auth",
      "Groq rejected the API key. Check it in Settings.",
      "groq",
      status,
    );
  if (status === 404 || code === "model_not_found")
    return new ProviderError(
      "model_not_found",
      `Groq doesn't know that model. ${message}`,
      "groq",
      status,
    );
  if (status === 429)
    return new ProviderError(
      "rate_limit",
      "Groq is rate-limiting requests. Try again shortly.",
      "groq",
      status,
    );
  if (status >= 500)
    return new ProviderError("unavailable", "Groq is having trouble right now.", "groq", status);
  if (code === "tool_use_failed") {
    return new ProviderError(
      "bad_request",
      "The model produced an invalid tool call. Try again, or choose a model with better tool support.",
      "groq",
      status,
    );
  }
  return new ProviderError("bad_request", message, "groq", status);
}
