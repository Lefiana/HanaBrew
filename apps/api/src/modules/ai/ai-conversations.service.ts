import { Injectable, NotFoundException } from "@nestjs/common";
import type { AIMessage } from "@hanabrew/ai-core";
import type { ConversationDetail, ConversationSummary } from "@hanabrew/contracts";
import { Prisma } from "@hanabrew/database";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { buildItems } from "./ai-dto.js";
import { deriveHana } from "./hana.js";
import { toAiMessage, windowHistory } from "./history.js";

export interface AiContext {
  workspaceId: string;
  userId: string;
  displayName: string;
}

export interface NewMessage {
  role: "USER" | "ASSISTANT" | "TOOL";
  content?: string;
  toolCalls?: unknown;
  providerState?: unknown;
  toolCallId?: string;
  toolName?: string;
  provider?: "GEMINI" | "GROQ" | "OLLAMA" | null;
  model?: string | null;
}

const toJson = (value: unknown) =>
  value === undefined || value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

@Injectable()
export class AiConversationsService {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly prisma: PrismaService) {}

  /** Runs one conversation's turns one at a time (in this process), so message order can't interleave. */
  withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(work);
    const tail = run.catch(() => undefined);
    this.locks.set(key, tail);
    void tail.then(() => {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    });
    return run;
  }

  private get db() {
    return this.prisma.client;
  }

  async list(ctx: AiContext): Promise<ConversationSummary[]> {
    const rows = await this.db.aiConversation.findMany({
      where: { workspaceId: ctx.workspaceId, userId: ctx.userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /** A conversation is private to its owner: anyone else gets a 404. */
  async getOwned(ctx: AiContext, id: string) {
    const row = await this.db.aiConversation.findFirst({
      where: { id, workspaceId: ctx.workspaceId, userId: ctx.userId },
    });
    if (!row) throw new NotFoundException("Conversation not found.");
    return row;
  }

  create(ctx: AiContext, title: string) {
    return this.db.aiConversation.create({
      data: { workspaceId: ctx.workspaceId, userId: ctx.userId, title: title.slice(0, 60) },
    });
  }

  async append(conversationId: string, message: NewMessage): Promise<{ id: string }> {
    const last = await this.db.aiMessage.findFirst({
      where: { conversationId },
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    const row = await this.db.aiMessage.create({
      data: {
        conversationId,
        seq: (last?.seq ?? 0) + 1,
        role: message.role,
        content: message.content ?? "",
        toolCalls: toJson(message.toolCalls),
        providerState: toJson(message.providerState),
        toolCallId: message.toolCallId ?? null,
        toolName: message.toolName ?? null,
        provider: message.provider ?? null,
        model: message.model ?? null,
      },
    });
    await this.db.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return row;
  }

  async history(conversationId: string): Promise<AIMessage[]> {
    const rows = await this.db.aiMessage.findMany({
      where: { conversationId },
      orderBy: { seq: "asc" },
    });
    return windowHistory(rows.map(toAiMessage));
  }

  /** Answers an action's tool call in the transcript so the provider never sees an orphaned call. */
  async appendToolResult(
    conversationId: string,
    action: { toolCallId: string; toolName: string },
    result: unknown,
  ): Promise<void> {
    await this.append(conversationId, {
      role: "TOOL",
      toolCallId: action.toolCallId,
      toolName: action.toolName,
      content: JSON.stringify(result),
    });
  }

  /** Approvals that outlived their time limit become EXPIRED (and are answered in the transcript). */
  async expireStale(conversationId: string, now = new Date()): Promise<void> {
    const stale = await this.db.aiToolAction.findMany({
      where: { conversationId, status: "PENDING", expiresAt: { lt: now } },
    });
    for (const action of stale) {
      const { count } = await this.db.aiToolAction.updateMany({
        where: { id: action.id, status: "PENDING" },
        data: { status: "EXPIRED", resolvedAt: now },
      });
      if (count === 1)
        await this.appendToolResult(conversationId, action, {
          ok: false,
          error: "The user didn't approve this in time, so it was not done.",
        });
    }
  }

  /** The user moved on without deciding: whatever is still waiting is declined. */
  async rejectAllPending(conversationId: string, now = new Date()): Promise<void> {
    const waiting = await this.db.aiToolAction.findMany({
      where: { conversationId, status: "PENDING" },
    });
    for (const action of waiting) {
      const { count } = await this.db.aiToolAction.updateMany({
        where: { id: action.id, status: "PENDING" },
        data: { status: "REJECTED", resolvedAt: now },
      });
      if (count === 1)
        await this.appendToolResult(conversationId, action, {
          ok: false,
          error: "The user moved on without approving this, so it was not done.",
        });
    }
  }

  async detail(ctx: AiContext, id: string): Promise<ConversationDetail> {
    const conversation = await this.getOwned(ctx, id);
    await this.expireStale(id);
    const [messages, actions] = await Promise.all([
      this.db.aiMessage.findMany({ where: { conversationId: id }, orderBy: { seq: "asc" } }),
      this.db.aiToolAction.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const items = buildItems(messages, actions);
    const pendingCount = actions.filter((a) => a.status === "PENDING").length;
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      items,
      pendingCount,
      hana: deriveHana(items, pendingCount),
    };
  }

  /** Deletes the conversation. The audit rows survive, with their content (arguments, summary, result) wiped. */
  async remove(ctx: AiContext, id: string): Promise<void> {
    await this.getOwned(ctx, id);
    await this.db.$transaction([
      this.db.aiToolAction.updateMany({
        where: { conversationId: id },
        data: { args: {}, summary: "(conversation deleted)", result: Prisma.JsonNull },
      }),
      this.db.aiConversation.delete({ where: { id } }),
    ]);
  }

  /** Undo a just-created user message (and its conversation if brand new) after the very first model call failed. */
  async rollback(
    conversationId: string,
    userMessageId: string,
    deleteConversation: boolean,
  ): Promise<void> {
    await this.db.aiMessage.deleteMany({ where: { id: userMessageId } });
    if (deleteConversation)
      await this.db.aiConversation.deleteMany({ where: { id: conversationId } });
  }
}
