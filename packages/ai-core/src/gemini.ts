import { randomUUID } from "node:crypto";
import { ProviderError, redact } from "./errors.js";
import { errorMessageFrom, requestJson } from "./http.js";
import { hasParameters } from "./schema.js";
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

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: JsonObject };
  functionResponse?: { name: string; response: JsonObject };
  [key: string]: unknown;
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

const DEFAULT_BASE = "https://generativelanguage.googleapis.com";

export class GeminiProvider implements AIProvider {
  readonly id = "gemini" as const;
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
    const url = `${this.base}/v1beta/models/${encodeURIComponent(request.model)}:generateContent`;
    const res = await requestJson(
      url,
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
      `${this.base}/v1beta/models?pageSize=200`,
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
    const models =
      (res.data as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> })
        .models ?? [];
    return models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter(Boolean)
      .sort();
  }

  // The key travels in a header, never in the URL, so it can't leak into logs or error messages.
  private headers(): Record<string, string> {
    return { "x-goog-api-key": this.apiKey, "content-type": "application/json" };
  }
}

export function buildBody(request: AIRequest): JsonObject {
  const body: JsonObject = {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: toContents(request.messages),
  };
  if (request.tools?.length) {
    body.tools = [
      {
        functionDeclarations: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          ...(hasParameters(tool.parameters) ? { parameters: tool.parameters } : {}),
        })),
      },
    ];
  }
  const generationConfig: JsonObject = {};
  if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
  if (request.maxOutputTokens !== undefined)
    generationConfig.maxOutputTokens = request.maxOutputTokens;
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
  return body;
}

/**
 * Gemini 3+ validates "thought signatures" on function calls: they must be returned exactly as received.
 * So an assistant turn produced by Gemini is replayed from its stored raw parts. A tool exchange that came from
 * another provider has no signatures, so it is flattened to plain text instead of risking a 400.
 */
export function toContents(messages: AIMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  let lastAssistantNative = false;
  let i = 0;
  while (i < messages.length) {
    const message = messages[i]!;
    if (message.role === "user") {
      contents.push({ role: "user", parts: [{ text: message.content || " " }] });
      lastAssistantNative = false;
      i += 1;
    } else if (message.role === "assistant") {
      const native =
        message.providerState?.provider === "gemini" && Array.isArray(message.providerState.data);
      lastAssistantNative = native;
      if (native) {
        contents.push({ role: "model", parts: message.providerState!.data as GeminiPart[] });
      } else if (message.toolCalls?.length) {
        const calls = message.toolCalls
          .map((c) => `[I called ${c.name} with ${JSON.stringify(c.args)}]`)
          .join("\n");
        contents.push({
          role: "model",
          parts: [{ text: [message.content, calls].filter(Boolean).join("\n") }],
        });
      } else {
        contents.push({ role: "model", parts: [{ text: message.content || " " }] });
      }
      i += 1;
    } else {
      // consecutive tool results become ONE user turn (Gemini needs all responses to a parallel call together)
      const results: Array<Extract<AIMessage, { role: "tool" }>> = [];
      while (i < messages.length && messages[i]!.role === "tool")
        results.push(messages[i++] as (typeof results)[number]);
      contents.push(
        lastAssistantNative
          ? {
              role: "user",
              parts: results.map((r) => ({
                functionResponse: { name: r.name, response: asObject(r.content) },
              })),
            }
          : {
              role: "user",
              parts: [
                { text: results.map((r) => `[Result of ${r.name}]\n${r.content}`).join("\n\n") },
              ],
            },
      );
    }
  }
  return contents;
}

function asObject(content: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : { result: parsed };
  } catch {
    return { result: content };
  }
}

export function parseResponse(data: unknown): AIResponse {
  const body = (data ?? {}) as {
    candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const usage = {
    ...(body.usageMetadata?.promptTokenCount === undefined
      ? {}
      : { inputTokens: body.usageMetadata.promptTokenCount }),
    ...(body.usageMetadata?.candidatesTokenCount === undefined
      ? {}
      : { outputTokens: body.usageMetadata.candidatesTokenCount }),
  };
  const candidate = body.candidates?.[0];
  if (!candidate) {
    if (body.promptFeedback?.blockReason)
      return { text: "", toolCalls: [], finishReason: "blocked", usage };
    throw new ProviderError("invalid_response", "Gemini returned no answer.", "gemini");
  }
  const parts = candidate.content?.parts ?? [];
  const text = parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
  const toolCalls: ToolCall[] = parts
    .filter((p) => p.functionCall)
    .map((p) => ({
      id: randomUUID(),
      name: p.functionCall!.name,
      args: p.functionCall!.args ?? {},
    }));

  return {
    text,
    toolCalls,
    // exactly as received, including any thoughtSignature fields
    providerState: { provider: "gemini", data: parts },
    finishReason: toolCalls.length ? "tool_calls" : mapFinish(candidate.finishReason),
    usage,
  };
}

function mapFinish(reason: string | undefined): FinishReason {
  if (!reason || reason === "STOP") return "stop";
  if (reason === "MAX_TOKENS") return "length";
  if (["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "RECITATION", "SPII"].includes(reason))
    return "blocked";
  return "other";
}

function mapError(status: number, data: unknown, apiKey: string): ProviderError {
  const message = redact(errorMessageFrom(data, `Gemini returned HTTP ${status}.`), [apiKey]);
  // Gemini reports an invalid key as HTTP 400 "API key not valid"
  if (
    status === 401 ||
    status === 403 ||
    /api key (not valid|expired)|API_KEY_INVALID/i.test(message)
  ) {
    return new ProviderError(
      "auth",
      "Gemini rejected the API key. Check it in Settings.",
      "gemini",
      status,
    );
  }
  if (status === 404)
    return new ProviderError(
      "model_not_found",
      `Gemini doesn't know that model. ${message}`,
      "gemini",
      status,
    );
  if (status === 429)
    return new ProviderError(
      "rate_limit",
      "Gemini is rate-limiting requests. Try again shortly.",
      "gemini",
      status,
    );
  if (status >= 500)
    return new ProviderError(
      "unavailable",
      "Gemini is having trouble right now.",
      "gemini",
      status,
    );
  return new ProviderError("bad_request", message, "gemini", status);
}
