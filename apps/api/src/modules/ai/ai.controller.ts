import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  chatRequestSchema,
  providerIdSchema,
  updateAiSettingsSchema,
  updateProviderSchema,
  uuidSchema,
  type AiOverview,
  type AiProviderId,
  type AiSettings,
  type ChatResponse,
  type ConversationDetail,
  type ConversationSummary,
  type ProviderStatus,
  type ProviderTestResult,
  type RecentAction,
} from "@hanabrew/contracts";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { CurrentUser, type AuthenticatedUser } from "../auth/index.js";
import {
  CurrentWorkspace,
  WorkspaceGuard,
  type WorkspaceContext,
} from "../workspaces/workspace-context.js";
import { AiConversationsService, type AiContext } from "./ai-conversations.service.js";
import { AiProvidersService } from "./ai-providers.service.js";
import { AiSettingsService } from "./ai-settings.service.js";
import { AiService } from "./ai.service.js";

const idPipe = new ZodValidationPipe(uuidSchema);
/** URLs use lowercase provider names (/providers/gemini); the API uses the upper-case ids. */
const providerPipe = new ZodValidationPipe(z.string().toUpperCase().pipe(providerIdSchema));
/** Calls that reach the model (or cost money) get a tighter limit than the rest of the API. */
// Read at request time (validated at startup by the env schema) so the limit can be tuned without code changes.
const MODEL_LIMIT = {
  default: { limit: () => Number(process.env.AI_RATE_LIMIT_PER_MINUTE ?? 20), ttl: 60_000 },
};

const toContext = (ws: WorkspaceContext, user: AuthenticatedUser): AiContext => ({
  workspaceId: ws.workspaceId,
  userId: ws.userId,
  displayName: user.displayName,
});

@ApiTags("ai")
@ApiCookieAuth()
@UseGuards(WorkspaceGuard)
@Controller("ai")
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly providers: AiProvidersService,
    private readonly settings: AiSettingsService,
    private readonly conversations: AiConversationsService,
  ) {}

  // ---- setup ----
  @Get("overview")
  overview(@CurrentWorkspace() ws: WorkspaceContext): Promise<AiOverview> {
    return this.providers.overview(ws.userId);
  }

  @Put("providers/:provider")
  updateProvider(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param("provider", providerPipe) provider: AiProviderId,
    @Body(new ZodValidationPipe(updateProviderSchema)) body: z.output<typeof updateProviderSchema>,
  ): Promise<ProviderStatus> {
    return this.providers.update(ws.userId, provider, body);
  }

  @Delete("providers/:provider/key")
  removeKey(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param("provider", providerPipe) provider: AiProviderId,
  ): Promise<ProviderStatus> {
    return this.providers.removeKey(ws.userId, provider);
  }

  @Get("providers/:provider/models")
  @Throttle(MODEL_LIMIT)
  async models(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param("provider", providerPipe) provider: AiProviderId,
  ): Promise<{ models: string[] }> {
    return { models: await this.providers.models(ws.userId, provider) };
  }

  @Post("providers/:provider/test")
  @HttpCode(200)
  @Throttle(MODEL_LIMIT)
  test(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param("provider", providerPipe) provider: AiProviderId,
  ): Promise<ProviderTestResult> {
    return this.providers.test(ws.userId, provider);
  }

  @Patch("settings")
  updateSettings(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodValidationPipe(updateAiSettingsSchema))
    body: z.output<typeof updateAiSettingsSchema>,
  ): Promise<AiSettings> {
    return this.settings.update(ws.userId, body);
  }

  // ---- chat ----
  @Post("chat")
  @HttpCode(200)
  @Throttle(MODEL_LIMIT)
  chat(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(chatRequestSchema)) body: z.output<typeof chatRequestSchema>,
  ): Promise<ChatResponse> {
    return this.ai.chat(toContext(ws, user), body);
  }

  @Post("actions/:id/approve")
  @HttpCode(200)
  @Throttle(MODEL_LIMIT)
  approve(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", idPipe) id: string,
  ): Promise<ChatResponse> {
    return this.ai.approve(toContext(ws, user), id);
  }

  @Post("actions/:id/reject")
  @HttpCode(200)
  @Throttle(MODEL_LIMIT)
  reject(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", idPipe) id: string,
  ): Promise<ChatResponse> {
    return this.ai.reject(toContext(ws, user), id);
  }

  @Get("actions")
  actions(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecentAction[]> {
    return this.ai.recentActions(toContext(ws, user));
  }

  // ---- conversations ----
  @Get("conversations")
  list(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConversationSummary[]> {
    return this.conversations.list(toContext(ws, user));
  }

  @Get("conversations/:id")
  get(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", idPipe) id: string,
  ): Promise<ConversationDetail> {
    return this.conversations.detail(toContext(ws, user), id);
  }

  @Delete("conversations/:id")
  @HttpCode(204)
  async remove(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", idPipe) id: string,
  ): Promise<void> {
    await this.conversations.remove(toContext(ws, user), id);
  }
}
