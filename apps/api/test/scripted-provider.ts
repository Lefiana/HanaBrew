/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are loosely-shaped JSON in tests */
import type { AIProvider, AIRequest, AIResponse, ToolCall } from "@hanabrew/ai-core";

type Step = AIResponse | Error | ((request: AIRequest) => AIResponse);

/** A fake model driven by a script, so every AI test is deterministic and free. */
export class ScriptedProvider implements AIProvider {
  readonly requests: AIRequest[] = [];
  private readonly steps: Step[] = [];
  private counter = 0;

  constructor(readonly id: "gemini" | "groq" | "ollama" = "ollama") {}

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    this.requests.push(structuredClone(request));
    const next = this.steps.shift();
    if (!next) throw new Error("ScriptedProvider ran out of scripted responses");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(request) : next;
  }

  async listModels(): Promise<string[]> {
    return ["test-model", "other-model"];
  }

  /** The model answers with plain text. */
  say(text: string): this {
    this.steps.push({ text, toolCalls: [], finishReason: "stop" });
    return this;
  }

  /** The model asks to call one or more tools (optionally with some text). */
  call(
    calls: Array<{ name: string; args: Record<string, unknown>; argsError?: string }>,
    text = "",
    providerState?: AIResponse["providerState"],
  ): this {
    const toolCalls: ToolCall[] = calls.map((c) => ({
      id: `call-${(this.counter += 1)}`,
      name: c.name,
      args: c.args,
      ...(c.argsError ? { argsError: c.argsError } : {}),
    }));
    this.steps.push({
      text,
      toolCalls,
      finishReason: "tool_calls",
      ...(providerState ? { providerState } : {}),
    });
    return this;
  }

  fail(error: Error): this {
    this.steps.push(error);
    return this;
  }

  /** Every remaining call returns this tool call, forever (to test the step limit). */
  loopForever(name: string, args: Record<string, unknown>): this {
    const step: Step = () => ({
      text: "",
      toolCalls: [{ id: `loop-${(this.counter += 1)}`, name, args }],
      finishReason: "tool_calls",
    });
    for (let i = 0; i < 20; i++) this.steps.push(step);
    return this;
  }

  /** Forget the script and recorded requests (called between tests). */
  reset(): void {
    this.steps.length = 0;
    this.requests.length = 0;
  }

  get remaining(): number {
    return this.steps.length;
  }

  /** The tool results the model was shown in its latest request, parsed. */
  lastToolResults(): Array<{ name: string; content: Record<string, any> }> {
    const last = this.requests.at(-1);
    return (last?.messages ?? [])
      .filter((m) => m.role === "tool")
      .map((m) => ({
        name: (m as { name: string }).name,
        content: JSON.parse((m as { content: string }).content) as Record<string, any>,
      }));
  }
}
