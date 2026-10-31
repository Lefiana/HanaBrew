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
  const result = envSchema.safeParse(source);
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
