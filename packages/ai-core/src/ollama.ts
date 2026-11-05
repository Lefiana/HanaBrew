import { randomUUID } from "node:crypto";
import { ProviderError } from "./errors.js";
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

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

export class OllamaProvider implements AIProvider {
  readonly id = "ollama" as const;
  private readonly base: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: ProviderOptions = {}) {
    this.base = (options.baseUrl ?? DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
    // local models can be slow, especially on first load
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    const res = await requestJson(
      `${this.base}/api/chat`,
      { method: "POST", headers: { "content-type": "application/json" }, body: buildBody(request) },
      {
        provider: this.id,
        fetch: this.options.fetch,
        timeoutMs: this.timeoutMs,
        signal: request.signal,
      },
    );
    if (!res.ok) throw mapError(res.status, res.data, request.model);
    return parseResponse(res.data);
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const res = await requestJson(
      `${this.base}/api/tags`,
      { method: "GET", headers: {} },
      {
        provider: this.id,
        fetch: this.options.fetch,
        timeoutMs: Math.min(this.timeoutMs, 15_000),
        signal,
      },
    );
    if (!res.ok) throw mapError(res.status, res.data, "");
    return ((res.data as { models?: Array<{ name?: string }> }).models ?? [])
      .map((m) => m.name ?? "")
      .filter(Boolean)
      .sort();
  }
}

export function toMessages(system: string, messages: AIMessage[]): JsonObject[] {
  const out: JsonObject[] = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "user") out.push({ role: "user", content: message.content });
    else if (message.role === "tool")
      out.push({ role: "tool", tool_name: message.name, content: message.content });
    else if (message.toolCalls?.length) {
      // Ollama takes arguments as an object (unlike OpenAI-style APIs, which use a JSON string)
      out.push({
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((c) => ({
          function: { name: c.name, arguments: c.args },
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
    stream: false,
  };
  if (request.tools?.length) {
    body.tools = request.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  const options: JsonObject = {};
  if (request.temperature !== undefined) options.temperature = request.temperature;
  if (request.maxOutputTokens !== undefined) options.num_predict = request.maxOutputTokens;
  if (Object.keys(options).length) body.options = options;
  return body;
}

export function parseResponse(data: unknown): AIResponse {
  const body = (data ?? {}) as {
    message?: {
      content?: string;
      tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }>;
    };
    done_reason?: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };
  if (!body.message)
    throw new ProviderError("invalid_response", "Ollama returned no answer.", "ollama");

  const toolCalls: ToolCall[] = (body.message.tool_calls ?? []).map((call) => {
    const base = { id: randomUUID(), name: call.function?.name ?? "" };
    const raw = call.function?.arguments;
    if (raw && typeof raw === "object" && !Array.isArray(raw))
      return { ...base, args: raw as JsonObject };
    if (typeof raw === "string") {
      try {
        const parsed: unknown = JSON.parse(raw || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
          return { ...base, args: parsed as JsonObject };
      } catch {
        /* fall through */
      }
      return { ...base, args: {}, argsError: "Tool arguments were not valid JSON." };
    }
    return { ...base, args: {} };
  });
  return {
    text: body.message.content ?? "",
    toolCalls,
    finishReason: toolCalls.length ? "tool_calls" : mapFinish(body.done_reason),
    usage: {
      ...(body.prompt_eval_count === undefined ? {} : { inputTokens: body.prompt_eval_count }),
      ...(body.eval_count === undefined ? {} : { outputTokens: body.eval_count }),
    },
  };
}

function mapFinish(reason: string | undefined): FinishReason {
  if (!reason || reason === "stop") return "stop";
  if (reason === "length") return "length";
  return "other";
}

function mapError(status: number, data: unknown, model: string): ProviderError {
  const message = errorMessageFrom(data, `Ollama returned HTTP ${status}.`);
  if (/does not support tools/i.test(message)) {
    return new ProviderError(
      "unsupported_tools",
      `The model “${model}” doesn't support tools. Choose a tool-capable model (for example a recent llama, qwen or mistral).`,
      "ollama",
      status,
    );
  }
  if (status === 404 || /not found/i.test(message)) {
    return new ProviderError(
      "model_not_found",
      `Ollama doesn't have the model “${model}”. Pull it first (ollama pull ${model}).`,
      "ollama",
      status,
    );
  }
  if (status >= 500)
    return new ProviderError("unavailable", `Ollama had a problem: ${message}`, "ollama", status);
  return new ProviderError("bad_request", message, "ollama", status);
}
