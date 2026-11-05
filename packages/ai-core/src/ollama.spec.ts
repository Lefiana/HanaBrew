/* eslint-disable @typescript-eslint/no-explicit-any -- these tests assert on loosely-shaped provider JSON */
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OllamaProvider } from "./ollama.js";
import { toolParameters } from "./schema.js";
import { startFakeServer, type FakeServer } from "./testing/fake-server.js";
import type { ToolDefinition } from "./types.js";

let server: FakeServer;
let provider: OllamaProvider;

beforeEach(async () => {
  server = await startFakeServer();
  provider = new OllamaProvider({ baseUrl: `${server.url}/`, timeoutMs: 2_000 }); // trailing slash is tolerated
});
afterEach(() => server.close());

const createTask: ToolDefinition = {
  name: "create_task",
  description: "Create a task",
  parameters: toolParameters(z.object({ title: z.string() })),
};
const ask = (model = "llama-x") =>
  provider.generateResponse({
    model,
    system: "s",
    messages: [{ role: "user", content: "x" }],
    tools: [createTask],
  });

describe("Ollama request", () => {
  it("posts to /api/chat with stream disabled, tools, and options", async () => {
    server.respond(200, {
      message: { role: "assistant", content: "Hi" },
      done: true,
      done_reason: "stop",
    });
    await provider.generateResponse({
      model: "llama-x",
      system: "Be Hana",
      messages: [{ role: "user", content: "hello" }],
      tools: [createTask],
      temperature: 0.3,
      maxOutputTokens: 128,
    });
    const req = server.requests[0]!;
    expect(req.url).toBe("/api/chat");
    expect(req.headers.authorization).toBeUndefined(); // no credentials for a local server
    expect(req.body).toMatchObject({
      model: "llama-x",
      stream: false,
      messages: [
        { role: "system", content: "Be Hana" },
        { role: "user", content: "hello" },
      ],
      tools: [{ type: "function", function: { name: "create_task" } }],
      options: { temperature: 0.3, num_predict: 128 },
    });
  });

  it("serialises earlier tool calls with OBJECT arguments and tool results with tool_name", async () => {
    server.respond(200, { message: { role: "assistant", content: "ok" }, done: true });
    await provider.generateResponse({
      model: "m",
      system: "s",
      messages: [
        { role: "user", content: "add" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "i", name: "create_task", args: { title: "T" } }],
        },
        { role: "tool", toolCallId: "i", name: "create_task", content: '{"ok":true}' },
      ],
    });
    const messages = (server.requests[0]!.body as { messages: any[] }).messages;
    expect(messages[2]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "create_task", arguments: { title: "T" } } }],
    });
    expect(messages[3]).toEqual({ role: "tool", tool_name: "create_task", content: '{"ok":true}' });
  });
});

describe("Ollama response", () => {
  it("parses text and token counts", async () => {
    server.respond(200, {
      message: { role: "assistant", content: "Hello!" },
      done: true,
      done_reason: "stop",
      prompt_eval_count: 12,
      eval_count: 4,
    });
    expect(await ask()).toMatchObject({
      text: "Hello!",
      finishReason: "stop",
      usage: { inputTokens: 12, outputTokens: 4 },
    });
  });

  it("parses tool calls (no ids from Ollama, so unique ids are generated)", async () => {
    server.respond(200, {
      message: {
        role: "assistant",
        content: "",
        tool_calls: [
          { function: { name: "create_task", arguments: { title: "A" } } },
          { function: { name: "create_task", arguments: { title: "B" } } },
        ],
      },
      done: true,
    });
    const out = await ask();
    expect(out.finishReason).toBe("tool_calls");
    expect(out.toolCalls.map((c) => c.args)).toEqual([{ title: "A" }, { title: "B" }]);
    expect(new Set(out.toolCalls.map((c) => c.id)).size).toBe(2);
  });

  it("tolerates string arguments and flags broken ones", async () => {
    server.respond(200, {
      message: {
        role: "assistant",
        content: "",
        tool_calls: [
          { function: { name: "create_task", arguments: '{"title":"S"}' } },
          { function: { name: "create_task", arguments: "{oops" } },
        ],
      },
      done: true,
    });
    const out = await ask();
    expect(out.toolCalls[0]!.args).toEqual({ title: "S" });
    expect(out.toolCalls[1]!.argsError).toMatch(/not valid JSON/);
  });
});

describe("Ollama errors and models", () => {
  it("explains an unreachable Ollama", async () => {
    const down = new OllamaProvider({ baseUrl: "http://127.0.0.1:9", timeoutMs: 1_000 });
    const error = await down
      .generateResponse({ model: "m", system: "s", messages: [{ role: "user", content: "x" }] })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "unavailable", fallbackEligible: true });
    expect((error as Error).message).toMatch(/Can't reach/);
  });

  it("maps a missing model and a model without tool support", async () => {
    server.respond(404, { error: 'model "zzz" not found, try pulling it first' });
    await expect(ask("zzz")).rejects.toMatchObject({
      kind: "model_not_found",
      message: expect.stringContaining("ollama pull zzz"),
    });
    server.clear();
    server.respond(400, { error: "registry.ollama.ai/library/gemma:2b does not support tools" });
    await expect(ask("gemma:2b")).rejects.toMatchObject({ kind: "unsupported_tools" });
  });

  it("lists installed models", async () => {
    server.respond(200, { models: [{ name: "qwen:7b" }, { name: "llama:8b" }] });
    expect(await provider.listModels()).toEqual(["llama:8b", "qwen:7b"]);
    expect(server.requests[0]!.url).toBe("/api/tags");
  });
});
