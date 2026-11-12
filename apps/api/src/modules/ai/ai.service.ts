import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  ProviderError,
  buildSystemPrompt,
  retryTransient,
  type AIResponse,
} from "@hanabrew/ai-core";
import type {
  AiProviderId,
  ChatResponse,
  ConfirmationPolicy,
  RecentAction,
  ResponseStyle,
} from "@hanabrew/contracts";
import { Prisma } from "@hanabrew/database";
import { todayInZone } from "../../common/dates.js";
import { ENV, type Env } from "../../config/config.module.js";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { TasksService } from "../tasks/tasks.service.js";
import { AiConversationsService, type AiContext } from "./ai-conversations.service.js";
import { AiProvidersService } from "./ai-providers.service.js";
import { AiSettingsService } from "./ai-settings.service.js";
import { requiresConfirmation } from "./confirmation.js";
import { friendlyMessage, toHttpError } from "./provider-errors.js";
import type { ProviderPlan } from "./provider-plan.js";
import { composeQuickReply } from "./quick-reply.js";
import { toToolError, type AiTool, type ToolContext } from "./tools/tool.js";
import { AiToolsService } from "./tools/tools.service.js";

/** A model may chain a few tool calls per request; this stops a confused one from looping forever. */
export const MAX_STEPS = 6;
export const APPROVAL_TTL_MS = 15 * 60_000;
const MAX_RESULT_CHARS = 8_000;
/** Generous: thinking models spend part of this budget on reasoning before they answer. */
const MAX_OUTPUT_TOKENS = 4096;

interface RunOptions {
  timeZone: string;
  plan: ProviderPlan & { primary: AiProviderId };
  policy: ConfirmationPolicy;
  style: ResponseStyle;
  /** Set on a fresh user message: if the very first model call fails, undo it so the user can simply retry. */
  rollback?: { userMessageId: string; deleteConversation: boolean };
}
interface RunInfo {
  provider: AiProviderId | null;
  model: string | null;
  modelCalls: number;
}
interface BatchResult {
  pending: number;
  /** True when every call was a change that ran successfully (nothing to read back, nothing failed, nothing waiting). */
  simpleWritesOnly: boolean;
}

const RISK = { read: "READ", write: "WRITE", destructive: "DESTRUCTIVE" } as const;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const newInfo = (): RunInfo => ({ provider: null, model: null, modelCalls: 0 });

/** Keeps what goes back to the model small; oversize results are replaced by a hint to narrow the request. */
function limitResult(data: unknown): unknown {
  const text = JSON.stringify(data);
  if (text.length <= MAX_RESULT_CHARS) return data;
  return {
    truncated: true,
    note: "The result was too large to show. Ask for something narrower.",
    preview: text.slice(0, 1_500),
  };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger("AI");

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AiProvidersService,
    private readonly aiSettings: AiSettingsService,
    private readonly conversations: AiConversationsService,
    private readonly tools: AiToolsService,
    private readonly tasks: TasksService,
    private readonly userSettings: SettingsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  // ---------------------------------------------------------------------------------------------- chat
  async chat(
    ctx: AiContext,
    request: {
      conversationId?: string | undefined;
      message: string;
      timeZone?: string | undefined;
    },
  ): Promise<ChatResponse> {
    const startedAt = Date.now();
    const timeZone = await this.userSettings.resolveTimeZone(ctx.userId, request.timeZone);
    const { plan, confirmationPolicy, responseStyle } = await this.providers.planFor(ctx.userId); // 422 before anything is written
    if (request.conversationId) await this.conversations.getOwned(ctx, request.conversationId);

    const lockKey = request.conversationId ?? `new:${ctx.userId}`;
    return this.conversations.withLock(lockKey, async () => {
      let conversationId = request.conversationId;
      const isNew = !conversationId;
      if (!conversationId)
        conversationId = (await this.conversations.create(ctx, request.message)).id;

      // Anything still waiting for approval is settled first, so the transcript is always consistent.
      await this.conversations.expireStale(conversationId);
      await this.conversations.rejectAllPending(conversationId);

      const userMessage = await this.conversations.append(conversationId, {
        role: "USER",
        content: request.message,
      });
      const info = await this.runTurn(ctx, conversationId, {
        timeZone,
        plan,
        policy: confirmationPolicy,
        style: responseStyle,
        rollback: { userMessageId: userMessage.id, deleteConversation: isNew },
      });
      return this.respond(ctx, conversationId, info, startedAt);
    });
  }

  // ---------------------------------------------------------------------------------------- approvals
  async approve(ctx: AiContext, actionId: string): Promise<ChatResponse> {
    return this.decide(ctx, actionId, "approve");
  }

  async reject(ctx: AiContext, actionId: string): Promise<ChatResponse> {
    return this.decide(ctx, actionId, "reject");
  }

  private async decide(
    ctx: AiContext,
    actionId: string,
    decision: "approve" | "reject",
  ): Promise<ChatResponse> {
    const startedAt = Date.now();
    const found = await this.db.aiToolAction.findFirst({
      where: { id: actionId, workspaceId: ctx.workspaceId, userId: ctx.userId },
    });
    if (!found?.conversationId) throw new NotFoundException("Action not found.");
    const conversationId = found.conversationId;

    return this.conversations.withLock(conversationId, async () => {
      await this.conversations.expireStale(conversationId);
      const action = await this.db.aiToolAction.findUnique({ where: { id: actionId } });
      if (!action) throw new NotFoundException("Action not found.");
      if (action.status === "EXPIRED")
        throw new ConflictException("That request expired. Ask Hana again if you still want it.");
      if (action.status !== "PENDING")
        throw new ConflictException("That request was already handled.");

      // Claim it atomically so a double click (or two tabs) can only ever run it once.
      const claim = await this.db.aiToolAction.updateMany({
        where: { id: actionId, status: "PENDING" },
        data:
          decision === "approve"
            ? { status: "RUNNING" }
            : { status: "REJECTED", resolvedAt: new Date() },
      });
      if (claim.count !== 1) throw new ConflictException("That request was already handled.");

      const timeZone = await this.userSettings.resolveTimeZone(ctx.userId);
      if (decision === "reject") {
        await this.conversations.appendToolResult(conversationId, action, {
          ok: false,
          error: "The user declined this action, so it was not done.",
        });
      } else {
        const tool = this.tools.get(action.toolName);
        if (!tool)
          await this.finishAction(conversationId, action, "FAILED", {
            ok: false,
            error: "That tool no longer exists.",
          });
        else
          await this.runAction(conversationId, action, tool, {
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            timeZone,
            now: new Date(),
          });
      }

      const info = newInfo();
      const stillWaiting = await this.db.aiToolAction.count({
        where: { conversationId, status: "PENDING" },
      });
      if (stillWaiting === 0) {
        const style = (await this.aiSettings.get(ctx.userId)).responseStyle;
        if (style === "QUICK" && (await this.finishQuickly(conversationId)))
          return this.respond(ctx, conversationId, info, startedAt);
        try {
          const { plan, confirmationPolicy, responseStyle } = await this.providers.planFor(
            ctx.userId,
          );
          Object.assign(
            info,
            await this.runTurn(ctx, conversationId, {
              timeZone,
              plan,
              policy: confirmationPolicy,
              style: responseStyle,
            }),
          );
        } catch (error) {
          // The action itself is done; only the follow-up message failed.
          await this.conversations.append(conversationId, {
            role: "ASSISTANT",
            content: `That's taken care of, but I couldn't reach my AI provider to follow up: ${friendlyMessage(error)}`,
          });
        }
      }
      return this.respond(ctx, conversationId, info, startedAt);
    });
  }

  /** After approvals, if everything resolved cleanly (changes done or declined, nothing to read back), confirm without a model call. */
  private async finishQuickly(conversationId: string): Promise<boolean> {
    const last = await this.db.aiMessage.findFirst({
      where: { conversationId, role: "ASSISTANT", NOT: { toolCalls: { equals: Prisma.DbNull } } },
      orderBy: { seq: "desc" },
    });
    const calls = Array.isArray(last?.toolCalls) ? (last.toolCalls as Array<{ id: string }>) : [];
    if (!last || calls.length === 0) return false;
    const actions = await this.db.aiToolAction.findMany({
      where: { conversationId, toolCallId: { in: calls.map((c) => c.id) } },
    });
    const clean =
      actions.length === calls.length &&
      actions.every(
        (a) => a.risk !== "READ" && (a.status === "EXECUTED" || a.status === "REJECTED"),
      );
    if (!clean) return false;
    await this.conversations.append(conversationId, {
      role: "ASSISTANT",
      content: composeQuickReply(
        actions.map((a) => ({
          status: a.status as "EXECUTED" | "REJECTED",
          outcome: outcomeText(a.result),
          summary: a.summary,
        })),
      ),
    });
    return true;
  }

  // -------------------------------------------------------------------------------- the model loop
  private async runTurn(
    ctx: AiContext,
    conversationId: string,
    options: RunOptions,
  ): Promise<RunInfo> {
    const info = newInfo();
    const toolContext = (): ToolContext => ({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      timeZone: options.timeZone,
      now: new Date(),
    });

    for (let step = 0; step < MAX_STEPS; step++) {
      let outcome: { response: AIResponse; provider: AiProviderId; model: string };
      try {
        outcome = await this.callModel(ctx, conversationId, options);
        info.modelCalls += 1;
      } catch (error) {
        if (info.modelCalls === 0 && options.rollback) {
          await this.conversations.rollback(
            conversationId,
            options.rollback.userMessageId,
            options.rollback.deleteConversation,
          );
          throw toHttpError(error);
        }
        // Something already happened this turn (actions ran), so keep the transcript and explain.
        await this.conversations.append(conversationId, {
          role: "ASSISTANT",
          content: `I got interrupted: ${friendlyMessage(error)}\nIf this keeps happening, try a different model or set a backup model in Settings → Hana's AI.`,
        });
        return info;
      }

      const { response, provider, model } = outcome;
      info.provider = provider;
      info.model = model;
      const toolCalls = response.toolCalls;
      await this.conversations.append(conversationId, {
        role: "ASSISTANT",
        content: toolCalls.length
          ? response.text
          : response.text.trim() || emptyReply(response.finishReason),
        toolCalls: toolCalls.length ? toolCalls : undefined,
        providerState: response.providerState,
        provider,
        model,
      });
      if (!toolCalls.length) return info;

      const batch = await this.handleToolCalls(
        ctx,
        conversationId,
        toolCalls,
        toolContext(),
        options.policy,
        { provider, model },
      );
      if (batch.pending > 0) return info; // wait for the user's approval

      if (options.style === "QUICK" && batch.simpleWritesOnly) {
        // Nothing to read back and nothing went wrong: confirm from the recorded outcomes instead of paying for another model call.
        await this.finishQuickly(conversationId);
        return info;
      }
    }

    await this.conversations.append(conversationId, {
      role: "ASSISTANT",
      content:
        "I've done a few things in a row and want to stop here so I don't run away with it. Tell me what to do next.",
    });
    return info;
  }

  /**
   * Tries, in order: the main model; a backup model on the SAME provider (no privacy change); then the user's
   * fallback provider, which `plan` only contains when their privacy settings allow it. Brief overloads
   * (503/429) are retried with a short pause before moving on.
   */
  private async callModel(ctx: AiContext, conversationId: string, options: RunOptions) {
    const now = new Date();
    const today = todayInZone(options.timeZone, now);
    const summary = await this.tasks.summary(ctx.workspaceId, today);
    const overview = `${summary.todo + summary.inProgress} open tasks (${summary.overdue} overdue), ${summary.completed} completed, ${summary.completionPercent}% overall completion`;
    const system = buildSystemPrompt({
      userName: ctx.displayName,
      now,
      timeZone: options.timeZone,
      overview,
    });
    const messages = await this.conversations.history(conversationId);

    const primary = await this.providers.build(ctx.userId, options.plan.primary);
    const attempts: Array<() => ReturnType<AiProvidersService["build"]>> = [
      () => Promise.resolve(primary),
    ];
    if (primary.backupModel && primary.backupModel !== primary.model) {
      attempts.push(() =>
        this.providers.build(ctx.userId, primary.provider, { model: primary.backupModel! }),
      );
    }
    if (options.plan.fallback)
      attempts.push(() => this.providers.build(ctx.userId, options.plan.fallback!));

    let lastError: unknown;
    for (const [index, makeAttempt] of attempts.entries()) {
      const built = await makeAttempt();
      try {
        const response = await retryTransient(
          () =>
            built.adapter.generateResponse({
              model: built.model,
              system,
              messages,
              tools: this.tools.definitions(),
              temperature: 0.3,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
            }),
          { retries: this.env.AI_RETRIES, baseMs: this.env.AI_RETRY_BASE_MS },
        );
        return { response, provider: built.provider, model: built.model };
      } catch (error) {
        lastError = error;
        const canTryNext =
          error instanceof ProviderError && error.fallbackEligible && index < attempts.length - 1;
        if (!canTryNext) throw error;
        this.logger.warn(
          `${built.provider}/${built.model} failed (${(error as ProviderError).kind}); trying the next option`,
        );
      }
    }
    throw lastError;
  }

  // ------------------------------------------------------------------------------------ tool calls
  private async handleToolCalls(
    ctx: AiContext,
    conversationId: string,
    calls: AIResponse["toolCalls"],
    toolContext: ToolContext,
    policy: ConfirmationPolicy,
    used: { provider: AiProviderId; model: string },
  ): Promise<BatchResult> {
    let pending = 0;
    let simpleWritesOnly = true;
    for (const call of calls) {
      const tool = this.tools.get(call.name);
      const base = {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        conversationId,
        toolCallId: call.id,
        toolName: call.name.slice(0, 80),
        provider: used.provider,
        model: used.model,
      };

      const reject = async (reason: string) => {
        simpleWritesOnly = false;
        const action = await this.db.aiToolAction.create({
          data: {
            ...base,
            risk: tool ? RISK[tool.risk] : "READ",
            status: "FAILED",
            args: json(call.args ?? {}),
            summary: `Tried to use “${call.name.slice(0, 60)}”`,
            result: json({ ok: false, error: reason }),
            resolvedAt: new Date(),
          },
        });
        await this.conversations.appendToolResult(conversationId, action, {
          ok: false,
          error: reason,
        });
      };

      if (!tool) {
        await reject(
          `There is no tool called “${call.name.slice(0, 60)}”. Use only the tools you were given.`,
        );
        continue;
      }
      if (call.argsError) {
        await reject(`${call.argsError} Call the tool again with valid JSON arguments.`);
        continue;
      }
      const parsed = tool.input.safeParse(call.args);
      if (!parsed.success) {
        await reject(
          `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`,
        );
        continue;
      }

      const needsApproval = requiresConfirmation(tool, policy);
      const action = await this.db.aiToolAction.create({
        data: {
          ...base,
          risk: RISK[tool.risk],
          status: needsApproval ? "PENDING" : "RUNNING",
          args: json(parsed.data),
          // Built by the server from the validated arguments, so the model can't dress up what an action really does.
          summary: await tool.summarize(parsed.data as never, toolContext),
          targetId: tool.targetId?.(parsed.data as never) ?? null,
          expiresAt: needsApproval ? new Date(Date.now() + APPROVAL_TTL_MS) : null,
        },
      });
      if (needsApproval) {
        pending += 1;
        simpleWritesOnly = false;
        continue;
      }
      const status = await this.runAction(conversationId, action, tool, toolContext);
      if (status !== "EXECUTED" || tool.risk === "read") simpleWritesOnly = false;
    }
    return { pending, simpleWritesOnly };
  }

  /** Executes an already-claimed (RUNNING) action and records the outcome in the audit row and the transcript. */
  private async runAction(
    conversationId: string,
    action: { id: string; toolCallId: string; toolName: string; args: unknown },
    tool: AiTool,
    toolContext: ToolContext,
  ): Promise<"EXECUTED" | "FAILED"> {
    let status: "EXECUTED" | "FAILED" = "EXECUTED";
    let result: { ok: boolean; outcome?: string; data?: unknown; error?: string };
    try {
      const args = tool.input.parse(action.args); // validated again at execution time
      const done = await tool.execute(args as never, toolContext);
      result = { ok: true, outcome: done.outcome, data: limitResult(done.data) };
    } catch (error) {
      const expected = toToolError(error);
      if (!expected)
        this.logger.error(
          `Tool ${action.toolName} crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
        );
      status = "FAILED";
      result = { ok: false, error: expected?.message ?? "Something went wrong while doing that." };
    }
    await this.finishAction(conversationId, action, status, result);
    return status;
  }

  private async finishAction(
    conversationId: string,
    action: { id: string; toolCallId: string; toolName: string },
    status: "EXECUTED" | "FAILED",
    result: unknown,
  ): Promise<void> {
    await this.db.aiToolAction.update({
      where: { id: action.id },
      data: { status, result: json(result), resolvedAt: new Date() },
    });
    await this.conversations.appendToolResult(conversationId, action, result);
  }

  // ------------------------------------------------------------------------------------------ views
  private async respond(
    ctx: AiContext,
    conversationId: string,
    info: RunInfo,
    startedAt: number,
  ): Promise<ChatResponse> {
    return {
      ...(await this.conversations.detail(ctx, conversationId)),
      provider: info.provider,
      model: info.model,
      latencyMs: Date.now() - startedAt,
      modelCalls: info.modelCalls,
    };
  }

  async recentActions(ctx: AiContext): Promise<RecentAction[]> {
    const rows = await this.db.aiToolAction.findMany({
      where: { workspaceId: ctx.workspaceId, userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      toolName: r.toolName,
      risk: r.risk.toLowerCase() as "read" | "write" | "destructive",
      status: r.status,
      provider: r.provider,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    }));
  }
}

function outcomeText(result: unknown): string | null {
  const r = result as { ok?: boolean; outcome?: string } | null;
  return r?.ok && r.outcome ? r.outcome : null;
}

function emptyReply(finish: AIResponse["finishReason"]): string {
  if (finish === "blocked") return "I can't help with that one.";
  if (finish === "length")
    return "I ran out of room before I could finish that. Could you ask for a smaller piece?";
  return "I don't have anything to add there. Could you rephrase?";
}
