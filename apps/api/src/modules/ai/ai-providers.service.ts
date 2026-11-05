import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ProviderError, type AIProvider } from "@hanabrew/ai-core";
import {
  isCloudProvider,
  type AiOverview,
  type AiProviderId,
  type ProviderStatus,
  type ProviderTestResult,
  type updateProviderSchema,
} from "@hanabrew/contracts";
import type { z } from "zod";
import { ENV, type Env } from "../../config/config.module.js";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { AiSettingsService } from "./ai-settings.service.js";
import { AI_PROVIDER_FACTORY, type ProviderFactory } from "./provider-factory.js";
import { planProviders, providerLabel, type ProviderPlan } from "./provider-plan.js";
import { friendlyMessage } from "./provider-errors.js";
import { SecretBox } from "./secret-box.js";
import { assertSafeEndpoint, UnsafeEndpointError } from "./url-guard.js";

const PROVIDERS: AiProviderId[] = ["GEMINI", "GROQ", "OLLAMA"];
type Row = {
  apiKeyEncrypted: string | null;
  apiKeyHint: string | null;
  model: string | null;
  baseUrl: string | null;
};

export interface BuiltProvider {
  provider: AiProviderId;
  model: string;
  adapter: AIProvider;
}

@Injectable()
export class AiProvidersService {
  private readonly logger = new Logger("AiProviders");
  private readonly box: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiSettingsService,
    @Inject(ENV) private readonly env: Env,
    @Inject(AI_PROVIDER_FACTORY) private readonly factory: ProviderFactory,
  ) {
    this.box = new SecretBox(env.APP_ENCRYPTION_KEY);
  }

  private aad = (userId: string, provider: AiProviderId) => `${userId}:${provider}`;

  private serverKey(provider: AiProviderId): string | undefined {
    return provider === "GEMINI"
      ? this.env.GEMINI_API_KEY
      : provider === "GROQ"
        ? this.env.GROQ_API_KEY
        : undefined;
  }

  private credentials(userId: string, provider: AiProviderId, row: Row | undefined) {
    if (provider === "OLLAMA") {
      const custom = this.env.AI_ALLOW_CUSTOM_OLLAMA_URL && row?.baseUrl ? row.baseUrl : null;
      return {
        apiKey: null,
        source: custom ? ("user" as const) : ("server" as const),
        baseUrl: custom ?? this.env.OLLAMA_BASE_URL,
      };
    }
    const own = row?.apiKeyEncrypted
      ? this.box.decrypt(row.apiKeyEncrypted, this.aad(userId, provider))
      : null;
    if (row?.apiKeyEncrypted && own === null)
      this.logger.warn(
        `Could not decrypt a stored ${provider} key (was APP_ENCRYPTION_KEY changed?)`,
      );
    const server = this.serverKey(provider) ?? null;
    return {
      apiKey: own ?? server,
      source: own ? ("user" as const) : server ? ("server" as const) : ("none" as const),
      baseUrl: null,
    };
  }

  private toStatus(userId: string, provider: AiProviderId, row: Row | undefined): ProviderStatus {
    const creds = this.credentials(userId, provider, row);
    const needsKey = provider !== "OLLAMA";
    const hasKey = creds.apiKey !== null;
    const model = row?.model ?? null;
    return {
      provider,
      source: creds.source,
      ready: (!needsKey || hasKey) && model !== null,
      hasKey,
      keyHint: row?.apiKeyEncrypted && row.apiKeyHint ? `…${row.apiKeyHint}` : null,
      model,
      baseUrl: provider === "OLLAMA" ? creds.baseUrl : null,
      cloud: isCloudProvider(provider),
      needsKey,
      customBaseUrlAllowed: provider === "OLLAMA" && this.env.AI_ALLOW_CUSTOM_OLLAMA_URL,
    };
  }

  private async rows(userId: string): Promise<Map<AiProviderId, Row>> {
    const rows = await this.prisma.client.aiProviderConfig.findMany({ where: { userId } });
    return new Map(rows.map((r) => [r.provider, r]));
  }

  async statuses(userId: string): Promise<ProviderStatus[]> {
    const rows = await this.rows(userId);
    return PROVIDERS.map((p) => this.toStatus(userId, p, rows.get(p)));
  }

  async overview(userId: string): Promise<AiOverview> {
    const [providers, settings] = await Promise.all([
      this.statuses(userId),
      this.settings.get(userId),
    ]);
    return {
      providers,
      settings,
      keyStorageAvailable: this.box.available,
      activeProvider: planProviders(providers, settings).primary,
    };
  }

  async update(
    userId: string,
    provider: AiProviderId,
    input: z.output<typeof updateProviderSchema>,
  ): Promise<ProviderStatus> {
    const data: {
      apiKeyEncrypted?: string;
      apiKeyHint?: string;
      model?: string | null;
      baseUrl?: string | null;
    } = {};

    if (input.apiKey !== undefined) {
      if (provider === "OLLAMA") throw new BadRequestException("Ollama doesn't use an API key.");
      if (!this.box.available) {
        throw new UnprocessableEntityException(
          "This server can't store API keys because APP_ENCRYPTION_KEY isn't set. Ask the administrator, or set a server-level key in the environment.",
        );
      }
      data.apiKeyEncrypted = this.box.encrypt(input.apiKey, this.aad(userId, provider));
      data.apiKeyHint = input.apiKey.slice(-4);
    }
    if (input.model !== undefined) data.model = input.model;
    if (input.baseUrl !== undefined) {
      if (provider !== "OLLAMA")
        throw new BadRequestException("Only Ollama has a custom endpoint.");
      if (input.baseUrl !== null && !this.env.AI_ALLOW_CUSTOM_OLLAMA_URL) {
        throw new ForbiddenException(
          "Custom Ollama endpoints are turned off on this server. The administrator can set OLLAMA_BASE_URL instead.",
        );
      }
      try {
        data.baseUrl = input.baseUrl === null ? null : assertSafeEndpoint(input.baseUrl);
      } catch (error) {
        if (error instanceof UnsafeEndpointError)
          throw new BadRequestException({
            message: "Validation failed.",
            issues: [{ path: "baseUrl", message: error.message }],
          });
        throw error;
      }
    }

    const row = await this.prisma.client.aiProviderConfig.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, ...data },
      update: data,
    });
    return this.toStatus(userId, provider, row);
  }

  async removeKey(userId: string, provider: AiProviderId): Promise<ProviderStatus> {
    await this.prisma.client.aiProviderConfig.updateMany({
      where: { userId, provider },
      data: { apiKeyEncrypted: null, apiKeyHint: null },
    });
    return (await this.statuses(userId)).find((s) => s.provider === provider)!;
  }

  /** The plan for this user, or a 422 explaining what to set up. Nothing is written before this check. */
  async planFor(userId: string): Promise<{
    plan: ProviderPlan & { primary: AiProviderId };
    confirmationPolicy: "DESTRUCTIVE_ONLY" | "ALL_WRITES";
  }> {
    const [statuses, settings] = await Promise.all([
      this.statuses(userId),
      this.settings.get(userId),
    ]);
    const plan = planProviders(statuses, settings);
    if (!plan.primary)
      throw new UnprocessableEntityException(
        plan.problem ?? "No AI provider is set up yet. Open Settings → AI.",
      );
    return {
      plan: plan as ProviderPlan & { primary: AiProviderId },
      confirmationPolicy: settings.confirmationPolicy,
    };
  }

  /** Builds the adapter for a provider, using the user's own key first, then the server's. */
  async build(
    userId: string,
    provider: AiProviderId,
    options: { requireModel?: boolean } = { requireModel: true },
  ): Promise<BuiltProvider> {
    const row = (await this.rows(userId)).get(provider);
    const creds = this.credentials(userId, provider, row);
    if (provider !== "OLLAMA" && !creds.apiKey)
      throw new UnprocessableEntityException(
        `${providerLabel(provider)} has no API key yet. Add one in Settings → AI.`,
      );
    if (options.requireModel && !row?.model)
      throw new UnprocessableEntityException(
        `Choose a ${providerLabel(provider)} model in Settings → AI.`,
      );
    const adapter = this.factory(provider, {
      apiKey: creds.apiKey ?? undefined,
      baseUrl: creds.baseUrl ?? undefined,
      timeoutMs: this.env.AI_REQUEST_TIMEOUT_MS,
    });
    return { provider, model: row?.model ?? "", adapter };
  }

  async models(userId: string, provider: AiProviderId): Promise<string[]> {
    const { adapter } = await this.build(userId, provider, { requireModel: false });
    return adapter.listModels();
  }

  /** A real round trip with the configured key and model, so problems show up here and not mid-conversation. */
  async test(userId: string, provider: AiProviderId): Promise<ProviderTestResult> {
    const started = Date.now();
    try {
      const built = await this.build(userId, provider);
      await built.adapter.generateResponse({
        model: built.model,
        system: "You are a connection test.",
        messages: [{ role: "user", content: "Reply with the single word OK." }],
        maxOutputTokens: 32,
        temperature: 0,
      });
      return {
        ok: true,
        message: `Connected. ${built.model} answered.`,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return { ok: false, message: friendlyMessage(error), latencyMs: null };
    }
  }
}

export { ProviderError };
