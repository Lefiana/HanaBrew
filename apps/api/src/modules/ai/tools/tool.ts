import { HttpException } from "@nestjs/common";
import { ZodError, type z } from "zod";
import type { ToolRisk } from "../confirmation.js";

export interface ToolContext {
  workspaceId: string;
  userId: string;
  /** The user's IANA zone; dates and times the model supplies are in this zone. */
  timeZone: string;
  now: Date;
}

export interface ToolOutcome {
  /** What goes back to the model (kept small). */
  data: unknown;
  /** A short human sentence shown on the action card, e.g. "Created task “Buy beans”". */
  outcome: string;
}

export interface AiTool {
  name: string;
  description: string;
  risk: ToolRisk;
  /** Acts on several records at once: always needs approval. */
  multiRecord?: boolean;
  input: z.ZodType;
  /** Human description of what the call will do, built from the VALIDATED arguments (never from the model's own words). Must not throw. */
  summarize(args: never, ctx: ToolContext): Promise<string>;
  execute(args: never, ctx: ToolContext): Promise<ToolOutcome>;
  targetId?(args: never): string | undefined;
}

/** Defines a tool with typed arguments (inferred from its Zod schema) and erases the type for the registry. */
export function defineTool<S extends z.ZodType>(tool: {
  name: string;
  description: string;
  risk: ToolRisk;
  multiRecord?: boolean;
  input: S;
  summarize(args: z.output<S>, ctx: ToolContext): Promise<string> | string;
  execute(args: z.output<S>, ctx: ToolContext): Promise<ToolOutcome>;
  targetId?(args: z.output<S>): string | undefined;
}): AiTool {
  return {
    ...tool,
    summarize: async (args, ctx) => {
      try {
        return await tool.summarize(args as z.output<S>, ctx);
      } catch {
        return tool.description;
      }
    },
    execute: (args, ctx) => tool.execute(args as z.output<S>, ctx),
    ...(tool.targetId ? { targetId: (args: never) => tool.targetId!(args as z.output<S>) } : {}),
  } as AiTool;
}

/** An expected failure the model can react to (not found, locked, invalid value...). */
export class ToolError extends Error {}

/** Converts service/validation errors into messages for the model; unexpected errors are rethrown. */
export function toToolError(error: unknown): ToolError | null {
  if (error instanceof ToolError) return error;
  if (error instanceof ZodError)
    return new ToolError(
      error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "),
    );
  if (error instanceof HttpException && error.getStatus() < 500) {
    const response = error.getResponse();
    const issues =
      typeof response === "object"
        ? (response as { issues?: Array<{ path: string; message: string }> }).issues
        : undefined;
    return new ToolError(
      issues?.length ? issues.map((i) => `${i.path}: ${i.message}`).join("; ") : error.message,
    );
  }
  return null;
}

export const LOCKED_MESSAGE =
  "That task is completed, so it's locked. The user has to reopen it themselves before it can change.";

const MAX_TEXT = 160;
export const clip = (text: string | null | undefined): string | null =>
  text && text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : (text ?? null);
