/* eslint-disable @typescript-eslint/no-explicit-any -- these tests assert on loosely-shaped provider JSON */
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GeminiProvider } from "./gemini.js";
import type { ProviderError } from "./errors.js";
import { toolParameters } from "./schema.js";
import { startFakeServer, type FakeServer } from "./testing/fake-server.js";
import type { AIMessage, ToolDefinition } from "./types.js";

const KEY = "AIza-test-secret-key-123456";
let server: FakeServer;
let provider: GeminiProvider;

beforeEach(async () => {
  server = await startFakeServer();
  provider = new GeminiProvider(KEY, { baseUrl: server.url, timeoutMs: 2_000 });
});
afterEach(() => server.close());

const createTask: ToolDefinition = {
  name: "create_task",
  description: "Create a task",
  parameters: toolParameters(
    z.object({
      title: z.string().min(1),
      dueDate: z.string().optional(),
      priority: z.enum(["LOW", "HIGH"]).default("LOW"),
    }),
  ),
};
const noArgs: ToolDefinition = {
  name: "get_overview",
  description: "Overview",
  parameters: toolParameters(z.object({})),
};
const textResponse = (text: string) => ({
  candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});

describe("Gemini request", () => {
  it("calls generateContent with the key in a header (never the URL or body), a system instruction and function declarations", async () => {
    server.respond(200, textResponse("Hi!"));
    await provider.generateResponse({
      model: "gemini-test",
      system: "Be Hana",
      messages: [{ role: "user", content: "hello" }],
      tools: [createTask, noArgs],
      temperature: 0.2,
      maxOutputTokens: 300,
    });

    const req = server.requests[0]!;
    expect(req.method).toBe("POST");
    expect(req.url).toBe("/v1beta/models/gemini-test:generateContent");
    expect(req.headers["x-goog-api-key"]).toBe(KEY);
    expect(req.url).not.toContain(KEY);
    expect(req.raw).not.toContain(KEY);
    const body = req.body as Record<string, any>;
    expect(body.systemInstruction.parts[0].text).toBe("Be Hana");
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "hello" }] }]);
    expect(body.generationConfig).toEqual({ temperature: 0.2, maxOutputTokens: 300 });
    const [declared, bare] = body.tools[0].functionDeclarations;
    expect(declared.name).toBe("create_task");
    expect(declared.parameters.required).toEqual(["title"]);
    expect(declared.parameters.properties.priority.enum).toEqual(["LOW", "HIGH"]);
    expect(bare.parameters).toBeUndefined(); // a tool with no arguments omits `parameters`
  });

  it("sends only schema keywords Gemini accepts", async () => {
    server.respond(200, textResponse("ok"));
    await provider.generateResponse({
      model: "m",
      system: "s",
      messages: [{ role: "user", content: "x" }],
      tools: [createTask],
    });
    const text = server.requests[0]!.raw;
    for (const banned of ["$schema", "additionalProperties", '"default"', '"format"', '"pattern"'])
      expect(text).not.toContain(banned);
  });
});

describe("Gemini response", () => {
  it("parses text and usage", async () => {
    server.respond(200, textResponse("Good morning!"));
    const out = await provider.generateResponse({
      model: "m",
      system: "s",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(out).toMatchObject({
      text: "Good morning!",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it("parses function calls, generates ids, and keeps the raw parts (with thought signatures) as provider state", async () => {
    const parts = [
      {
        functionCall: { name: "create_task", args: { title: "Buy beans" } },
        thoughtSignature: "SIG-A",
      },
    ];
    server.respond(200, {
      candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }],
    });
    const out = await provider.generateResponse({
      model: "m",
      system: "s",
      messages: [{ role: "user", content: "add" }],
      tools: [createTask],
    });
    expect(out.finishReason).toBe("tool_calls");
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0]).toMatchObject({ name: "create_task", args: { title: "Buy beans" } });
    expect(out.toolCalls[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(out.providerState).toEqual({ provider: "gemini", data: parts });
  });

  it("ignores 'thought' parts in the visible text", async () => {
    server.respond(200, {
      candidates: [
        {
          content: { parts: [{ text: "secret reasoning", thought: true }, { text: "Answer" }] },
          finishReason: "STOP",
        },
      ],
    });
    expect(
      (
        await provider.generateResponse({
          model: "m",
          system: "s",
          messages: [{ role: "user", content: "x" }],
        })
      ).text,
    ).toBe("Answer");
  });

  it("reports blocked prompts and safety stops as 'blocked'", async () => {
    const ask = () =>
      provider.generateResponse({
        model: "m",
        system: "s",
        messages: [{ role: "user", content: "x" }],
      });
    server.respond(200, { promptFeedback: { blockReason: "SAFETY" } });
    expect((await ask()).finishReason).toBe("blocked");
    server.clear();
    server.respond(200, { candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }] });
    const second = await ask();
    expect(second.finishReason).toBe("blocked");
    expect(second.text).toBe("");
  });
});

describe("Gemini conversation replay (thought signatures)", () => {
  it("replays Gemini's own turn from the stored raw parts and groups tool results into one user turn", async () => {
    const parts = [
      { functionCall: { name: "search_tasks", args: { query: "a" } }, thoughtSignature: "SIG-A" },
      { functionCall: { name: "get_overview", args: {} } },
    ];
    server.respond(200, textResponse("done"));
    const messages: AIMessage[] = [
      { role: "user", content: "check" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "1", name: "search_tasks", args: { query: "a" } },
          { id: "2", name: "get_overview", args: {} },
        ],
        providerState: { provider: "gemini", data: parts },
      },
      {
        role: "tool",
        toolCallId: "1",
        name: "search_tasks",
        content: JSON.stringify({ ok: true, data: [1, 2] }),
      },
      {
        role: "tool",
        toolCallId: "2",
        name: "get_overview",
        content: JSON.stringify({ ok: true }),
      },
    ];
    await provider.generateResponse({ model: "m", system: "s", messages });

    const contents = (server.requests[0]!.body as { contents: any[] }).contents;
    expect(contents).toHaveLength(3);
    expect(contents[1]).toEqual({ role: "model", parts }); // byte-for-byte, signature intact
    expect(contents[1].parts[0].thoughtSignature).toBe("SIG-A");
    expect(contents[2].role).toBe("user");
    expect(contents[2].parts).toEqual([
      { functionResponse: { name: "search_tasks", response: { ok: true, data: [1, 2] } } },
      { functionResponse: { name: "get_overview", response: { ok: true } } },
    ]);
  });

  it("flattens a tool exchange that came from another provider instead of sending unsigned function calls", async () => {
    server.respond(200, textResponse("done"));
    await provider.generateResponse({
      model: "m",
      system: "s",
      messages: [
        { role: "user", content: "add a task" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "x", name: "create_task", args: { title: "T" } }],
          providerState: { provider: "groq", data: null },
        },
        { role: "tool", toolCallId: "x", name: "create_task", content: '{"ok":true}' },
        { role: "user", content: "thanks" },
      ],
    });
    const raw = server.requests[0]!.raw;
    expect(raw).not.toContain("functionCall");
    expect(raw).not.toContain("functionResponse");
    expect(raw).toContain("I called create_task");
    expect(raw).toContain("Result of create_task");
  });
});

describe("Gemini errors", () => {
  const call = () =>
    provider.generateResponse({
      model: "m",
      system: "s",
      messages: [{ role: "user", content: "x" }],
    });

  it.each([
    [400, { error: { message: "API key not valid. Please pass a valid API key." } }, "auth"],
    [403, { error: { message: "denied" } }, "auth"],
    [404, { error: { message: "models/zzz is not found" } }, "model_not_found"],
    [429, { error: { message: "quota" } }, "rate_limit"],
    [503, { error: { message: "overloaded" } }, "unavailable"],
    [400, { error: { message: "Invalid JSON payload" } }, "bad_request"],
  ])("maps HTTP %i to %s", async (status, body, kind) => {
    server.respond(status, body);
    await expect(call()).rejects.toMatchObject({ name: "ProviderError", kind });
  });

  it("never leaks the API key, even if the provider echoes it", async () => {
    server.respond(400, { error: { message: `Bad request for key ${KEY}` } });
    const error = (await call().catch((e: unknown) => e)) as ProviderError;
    expect(error.message).not.toContain(KEY);
    expect(String(error.stack)).not.toContain(KEY);
  });

  it("times out", async () => {
    server.respond(200, textResponse("slow"), 1_500);
    const slow = new GeminiProvider(KEY, { baseUrl: server.url, timeoutMs: 100 });
    await expect(
      slow.generateResponse({
        model: "m",
        system: "s",
        messages: [{ role: "user", content: "x" }],
      }),
    ).rejects.toMatchObject({ kind: "timeout" });
  });

  it("reports an unreachable server as unavailable and fallback-eligible", async () => {
    const down = new GeminiProvider(KEY, { baseUrl: "http://127.0.0.1:9", timeoutMs: 1_000 });
    const error = (await down
      .generateResponse({ model: "m", system: "s", messages: [{ role: "user", content: "x" }] })
      .catch((e: unknown) => e)) as ProviderError;
    expect(error.kind).toBe("unavailable");
    expect(error.fallbackEligible).toBe(true);
    expect(error.message).not.toContain(KEY);
  });

  it("rejects an oversized response", async () => {
    server.respond(200, { candidates: [], junk: "x".repeat(5 * 1024 * 1024) });
    await expect(call()).rejects.toMatchObject({ kind: "invalid_response" });
  });
});

describe("Gemini listModels", () => {
  it("returns only models that can generate content, without the 'models/' prefix", async () => {
    server.respond(200, {
      models: [
        { name: "models/gemini-b", supportedGenerationMethods: ["generateContent"] },
        { name: "models/embed", supportedGenerationMethods: ["embedContent"] },
        { name: "models/gemini-a", supportedGenerationMethods: ["generateContent", "countTokens"] },
      ],
    });
    expect(await provider.listModels()).toEqual(["gemini-a", "gemini-b"]);
    expect(server.requests[0]!.headers["x-goog-api-key"]).toBe(KEY);
  });
});
