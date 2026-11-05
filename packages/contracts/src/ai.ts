import { z } from "zod";
import { timeZoneSchema, uuidSchema, isoInstantSchema } from "./common.js";

export const AI_PROVIDERS = ["GEMINI", "GROQ", "OLLAMA"] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];
export const providerIdSchema = z.enum(AI_PROVIDERS);
/** Cloud providers send your data to a third party; Ollama runs on your own machine/network. */
export const isCloudProvider = (provider: AiProviderId): boolean => provider !== "OLLAMA";

export const CONFIRMATION_POLICIES = ["DESTRUCTIVE_ONLY", "ALL_WRITES"] as const;
export type ConfirmationPolicy = (typeof CONFIRMATION_POLICIES)[number];

/** Presentation states for Hana's companion. A mood is a visual cue only, never a measure of correctness. */
export const HANA_MOODS = [
  "idle",
  "listening",
  "thinking",
  "happy",
  "concerned",
  "encouraging",
  "sleeping",
] as const;
export type HanaMood = (typeof HANA_MOODS)[number];

export const hanaResponseSchema = z.object({
  message: z.string(),
  mood: z.enum(HANA_MOODS),
  suggestions: z.array(z.string()).optional(),
});
export type HanaResponse = z.infer<typeof hanaResponseSchema>;

// ---- provider configuration (credentials are write-only: they never appear in any response) ----
export const providerStatusSchema = z.object({
  provider: providerIdSchema,
  /** Where credentials come from: the user's own saved key, the server's environment, or nowhere. */
  source: z.enum(["user", "server", "none"]),
  /** True when this provider can be called right now (key/URL available and a model chosen). */
  ready: z.boolean(),
  hasKey: z.boolean(),
  /** Last 4 characters of a saved key, so you can tell which key is stored. */
  keyHint: z.string().nullable(),
  model: z.string().nullable(),
  baseUrl: z.string().nullable(),
  cloud: z.boolean(),
  needsKey: z.boolean(),
  /** Ollama only: whether this server allows a per-user endpoint. */
  customBaseUrlAllowed: z.boolean(),
});
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export const aiSettingsSchema = z.object({
  preferredProvider: providerIdSchema.nullable(),
  fallbackProvider: providerIdSchema.nullable(),
  allowCloudFallback: z.boolean(),
  confirmationPolicy: z.enum(CONFIRMATION_POLICIES),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const aiOverviewSchema = z.object({
  providers: z.array(providerStatusSchema),
  settings: aiSettingsSchema,
  /** False when the server has no APP_ENCRYPTION_KEY, so user API keys can't be stored (server keys still work). */
  keyStorageAvailable: z.boolean(),
  /** The provider that would answer the next message, or null if none is ready. */
  activeProvider: providerIdSchema.nullable(),
});
export type AiOverview = z.infer<typeof aiOverviewSchema>;

export const updateProviderSchema = z
  .strictObject({
    apiKey: z.string().trim().min(8, "That key looks too short.").max(512).optional(),
    model: z.string().trim().min(1).max(120).nullable().optional(),
    baseUrl: z.url().max(300).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update.");
export type UpdateProviderInput = z.input<typeof updateProviderSchema>;

export const updateAiSettingsSchema = z
  .strictObject({
    preferredProvider: providerIdSchema.nullable().optional(),
    fallbackProvider: providerIdSchema.nullable().optional(),
    allowCloudFallback: z.boolean().optional(),
    confirmationPolicy: z.enum(CONFIRMATION_POLICIES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update.");
export type UpdateAiSettingsInput = z.input<typeof updateAiSettingsSchema>;

export const providerTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  latencyMs: z.number().int().nullable(),
});
export type ProviderTestResult = z.infer<typeof providerTestResultSchema>;
export const providerModelsSchema = z.object({ models: z.array(z.string()) });

// ---- chat ----
export const chatRequestSchema = z.strictObject({
  conversationId: uuidSchema.optional(),
  message: z.string().trim().min(1, "Say something first.").max(4000),
  timeZone: timeZoneSchema.optional(),
});
export type ChatRequest = z.input<typeof chatRequestSchema>;

export const TOOL_RISKS = ["read", "write", "destructive"] as const;
export const ACTION_STATUSES = [
  "PENDING",
  "RUNNING",
  "EXECUTED",
  "REJECTED",
  "FAILED",
  "EXPIRED",
] as const;

export const chatItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("user"),
    id: uuidSchema,
    content: z.string(),
    createdAt: isoInstantSchema,
  }),
  z.object({
    type: z.literal("assistant"),
    id: uuidSchema,
    content: z.string(),
    createdAt: isoInstantSchema,
  }),
  z.object({
    type: z.literal("action"),
    id: uuidSchema,
    toolName: z.string(),
    risk: z.enum(TOOL_RISKS),
    status: z.enum(ACTION_STATUSES),
    /** Built by the server from the validated arguments, never from the model's own words. */
    summary: z.string(),
    /** What happened (or why it failed). Absent while pending. */
    outcome: z.string().nullable(),
    expiresAt: isoInstantSchema.nullable(),
    createdAt: isoInstantSchema,
  }),
]);
export type ChatItem = z.infer<typeof chatItemSchema>;

export const conversationSummarySchema = z.object({
  id: uuidSchema,
  title: z.string(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const conversationDetailSchema = conversationSummarySchema.extend({
  items: z.array(chatItemSchema),
  /** Number of actions waiting for your approval. */
  pendingCount: z.number().int().nonnegative(),
  hana: hanaResponseSchema,
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const chatResponseSchema = conversationDetailSchema.extend({
  provider: providerIdSchema.nullable(),
  model: z.string().nullable(),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;

export const recentActionSchema = z.object({
  id: uuidSchema,
  toolName: z.string(),
  risk: z.enum(TOOL_RISKS),
  status: z.enum(ACTION_STATUSES),
  provider: providerIdSchema.nullable(),
  createdAt: isoInstantSchema,
  resolvedAt: isoInstantSchema.nullable(),
});
export type RecentAction = z.infer<typeof recentActionSchema>;
