import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Local-development convenience: load the repo-root .env when running from apps/api.
 * Variables that are already set (Docker, CI, production) always take precedence.
 */
export function loadDotenvForDevelopment(): void {
  if (process.env.NODE_ENV === "production") return;
  const candidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (file) process.loadEnvFile(file);
}
