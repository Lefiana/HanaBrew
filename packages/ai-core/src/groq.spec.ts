/* eslint-disable @typescript-eslint/no-explicit-any -- these tests assert on loosely-shaped provider JSON */
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GroqProvider } from "./groq.js";
import { toolParameters } from "./schema.js";
import { startFakeServer, type FakeServer } from "./testing/fake-server.js";
import type { ToolDefinition } from "./types.js";

const KEY = "gsk_test_secret_key_987654";
let server: FakeServer;
let provider: GroqProvider;

beforeEach(async () => {
  server = await startFakeServer();
  provider = new GroqProvider(KEY, { baseUrl: `${server.url}/openai/v1`, timeoutMs: 2_000 });
});
afterEach(() => server.close());

const createTask: ToolDefinition = {
  name: "create_task",
  description: "Create a task",
  parameters: toolParameters(z.object({ title: z.string() })),
};
const reply = (message: object, finish = "stop") => ({
  choices: [{ message, finish_reason: finish }],
  usage: { prompt_tokens: 7, completion_tokens: 3 },
});
const ask = () =>
  provider.generateResponse({
    model: "m",
    system: "s",
    messages: [{ role: "user", content: "x" }],
    tools: [createTask],
  });

describe("Groq request", () => {
  it("posts OpenAI-style chat completions with a Bearer key, a system message and function tools", async () => {
    server.respond(200, reply({ content: "Hi" }));
    await provider.generateResponse({
      model: "llama-x",
      system: "Be Hana",
      messages: [{ role: "user", content: "hello" }],
      tools: [createTask],
      temperature: 0.1,
      maxOutputTokens: 200,
    });
    const req = server.requests[0]!;
    expect(req.url).toBe("/openai/v1/chat/completions");
    expect(req.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(req.raw).not.toContain(KEY);
    expect(req.body).toMatchObject({
      model: "llama-x",
      messages: [
        { role: "system", content: "Be Hana" },
        { role: "user", content: "hello" },
      ],
      tools: [
        { type: "function", function: { name: "create_task", description: "Create a task" } },
      ],
      tool_choice: "auto",
      temperature: 0.1,
      max_completion_tokens: 200,
    });
  });

  it("serialises an earlier tool exchange: arguments as a JSON string, results as role 'tool' with the call id", async () => {
    server.respond(200, reply({ content: "ok" }));
    await provider.generateResponse({
      model: "m",
      system: "s",
      messages: [
        { role: "user", content: "add" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_1", name: "create_task", args: { title: "T" } }],
        },
        { role: "tool", toolCallId: "call_1", name: "create_task", content: '{"ok":true}' },
      ],
    });
    const messages = (server.requests[0]!.body as { messages: any[] }).messages;
    expect(messages[2]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "create_task", arguments: '{"title":"T"}' },
        },
      ],
    });
    expect(messages[3]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      name: "create_task",
      content: '{"ok":true}',
    });
  });
});

describe("Groq response", () => {
  it("parses text", async () => {
    server.respond(200, reply({ content: "Hello!" }));
    expect(await ask()).toMatchObject({
      text: "Hello!",
      finishReason: "stop",
      usage: { inputTokens: 7, outputTokens: 3 },
    });
  });

  it("parses tool calls and decodes their JSON arguments", async () => {
    server.respond(
      200,
      reply(
        {
          content: null,
          tool_calls: [
            {
              id: "call_9",
              type: "function",
              function: { name: "create_task", arguments: '{"title":"Buy beans"}' },
            },
          ],
        },
        "tool_calls",
      ),
    );
    const out = await ask();
    expect(out.finishReason).toBe("tool_calls");
    expect(out.toolCalls).toEqual([
      { id: "call_9", name: "create_task", args: { title: "Buy beans" } },
    ]);
  });

  it("flags malformed arguments instead of guessing", async () => {
    server.respond(
      200,
      reply(
        {
          content: null,
          tool_calls: [
            { id: "c", function: { name: "create_task", arguments: '{"title": "unterminated' } },
            { id: "d", function: { name: "create_task", arguments: "[1,2]" } },
          ],
        },
        "tool_calls",
      ),
    );
    const out = await ask();
    expect(out.toolCalls[0]).toMatchObject({
      name: "create_task",
      args: {},
      argsError: expect.stringMatching(/not valid JSON/),
    });
    expect(out.toolCalls[1]!.argsError).toMatch(/JSON object/);
  });
});

describe("Groq errors and models", () => {
  it.each([
    [401, { error: { message: "Invalid API Key" } }, "auth"],
    [
      404,
      { error: { message: "The model `x` does not exist", code: "model_not_found" } },
      "model_not_found",
    ],
    [429, { error: { message: "rate limit" } }, "rate_limit"],
    [500, { error: { message: "oops" } }, "unavailable"],
    [
      400,
      { error: { message: "Failed to call a function.", code: "tool_use_failed" } },
      "bad_request",
    ],
  ])("maps HTTP %i to %s", async (status, body, kind) => {
    server.respond(status, body);
    await expect(ask()).rejects.toMatchObject({ kind });
  });

  it("explains a failed tool call helpfully", async () => {
    server.respond(400, {
      error: {
        message: "Failed to call a function.",
        code: "tool_use_failed",
        failed_generation: "<function=...>",
      },
    });
    await expect(ask()).rejects.toThrow(/invalid tool call/);
  });

  it("redacts the key from error text", async () => {
    server.respond(400, { error: { message: `bad ${KEY}` } });
    const error = (await ask().catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain(KEY);
  });

  it("lists chat-capable models and hides speech/guard models", async () => {
    server.respond(200, {
      data: [
        { id: "whisper-large-v3" },
        { id: "llama-b" },
        { id: "playai-tts" },
        { id: "llama-a" },
        { id: "llama-guard-4" },
      ],
    });
    expect(await provider.listModels()).toEqual(["llama-a", "llama-b"]);
    expect(server.requests[0]!.url).toBe("/openai/v1/models");
  });
});
