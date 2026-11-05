import { z } from "zod";

const csv = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1));

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PUBLIC_URL: z.url(),
  WEB_PUBLIC_URL: z.url(),
  CORS_ALLOWED_ORIGINS: csv,
  DATABASE_URL: z
    .string()
    .refine((value) => /^postgres(ql)?:\/\//.test(value), "must be a postgres:// URL"),
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  SWAGGER_ENABLED: booleanString.optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  APP_ENCRYPTION_KEY: z.string().min(32).optional(),

  // --- AI (all optional). Server-level credentials act as defaults for users who haven't saved their own. ---
  GEMINI_API_KEY: z.string().min(8).optional(),
  GROQ_API_KEY: z.string().min(8).optional(),
  OLLAMA_BASE_URL: z.url().default("http://localhost:11434"),
  /** Lets each user point Hana at their own Ollama endpoint. Off by default: it makes the server call a user-chosen URL. */
  AI_ALLOW_CUSTOM_OLLAMA_URL: booleanString.default(false),
  /** Requests per minute (per client IP) for calls that reach the model. */
  AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(20),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(90_000),
});

export type Env = Omit<z.infer<typeof envSchema>, "SWAGGER_ENABLED"> & { SWAGGER_ENABLED: boolean };

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvValidationError";
  }
}

/** Pure parser: validates a variable bag and applies derived defaults. Never reads process.env. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // Docker Compose passes unset optional variables as empty strings; treat those as "not set".
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => {
        const message = issue.message.includes("received undefined")
          ? "is required"
          : issue.message;
        return `${issue.path.join(".") || "(root)"}: ${message}`;
      }),
    );
  }
  const data = result.data;
  return { ...data, SWAGGER_ENABLED: data.SWAGGER_ENABLED ?? data.NODE_ENV !== "production" };
}
