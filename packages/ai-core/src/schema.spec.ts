/* eslint-disable @typescript-eslint/no-explicit-any -- these tests assert on loosely-shaped provider JSON */
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./persona.js";
import { hasParameters, toolParameters } from "./schema.js";

describe("toolParameters", () => {
  it("turns a Zod schema into a minimal object schema", () => {
    const params = toolParameters(
      z.object({
        taskId: z.uuid().describe("The task's id"),
        title: z.string().min(1).max(200).optional(),
        tags: z.array(z.string()).max(10).optional(),
        status: z.enum(["TODO", "DONE"]).default("TODO"),
        limit: z.number().int().min(1).max(25).optional(),
      }),
    );
    expect(params.type).toBe("object");
    expect(params.required).toEqual(["taskId"]);
    const props = params.properties as Record<string, any>;
    expect(props.taskId).toEqual({ type: "string", description: "The task's id" });
    expect(props.tags).toEqual({ type: "array", items: { type: "string" }, maxItems: 10 });
    expect(props.status).toEqual({ type: "string", enum: ["TODO", "DONE"] });
    expect(props.limit).toEqual({ type: "integer", minimum: 1, maximum: 25 });
    expect(JSON.stringify(params)).not.toMatch(
      /\$schema|additionalProperties|"format"|"default"|"pattern"/,
    );
  });

  it("keeps property names that happen to match schema keywords", () => {
    const params = toolParameters(
      z.object({
        type: z.string(),
        items: z.string().optional(),
        description: z.string().optional(),
      }),
    );
    expect(Object.keys(params.properties as object).sort()).toEqual([
      "description",
      "items",
      "type",
    ]);
  });

  it("detects tools without arguments", () => {
    expect(hasParameters(toolParameters(z.object({})))).toBe(false);
    expect(hasParameters(toolParameters(z.object({ a: z.string() })))).toBe(true);
  });
});

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt({
    userName: "Lei",
    now: new Date("2026-11-02T06:05:00Z"),
    timeZone: "Asia/Manila",
    overview: "3 open tasks, 1 overdue",
  });

  it("anchors relative dates to the user's clock", () => {
    expect(prompt).toContain("Monday, November 2, 2026");
    expect(prompt).toContain("Asia/Manila");
    expect(prompt).toContain("2026-11-02");
    expect(prompt).toContain("Lei");
    expect(prompt).toContain("3 open tasks, 1 overdue");
  });

  it("states the safety rules the app relies on", () => {
    expect(prompt).toMatch(/untrusted user data/);
    expect(prompt).toMatch(/Never invent/);
    expect(prompt).toMatch(/approval/);
    expect(prompt).toMatch(/Completed tasks are locked/);
  });

  it("uses the local date even when UTC is a day behind", () => {
    const late = buildSystemPrompt({
      userName: "A",
      now: new Date("2026-11-01T20:00:00Z"),
      timeZone: "Asia/Manila",
    });
    expect(late).toContain("Today's date is 2026-11-02");
  });
});
