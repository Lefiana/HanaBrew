import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "./env.js";

const valid = {
  API_PUBLIC_URL: "http://localhost:4000",
  WEB_PUBLIC_URL: "http://localhost:3000",
  CORS_ALLOWED_ORIGINS: "http://localhost:3000, http://127.0.0.1:3000",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("applies defaults and parses the origin list", () => {
    const env = parseEnv(valid);
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(["http://localhost:3000", "http://127.0.0.1:3000"]);
    expect(env.SWAGGER_ENABLED).toBe(true);
  });

  it("turns Swagger off by default in production", () => {
    expect(parseEnv({ ...valid, NODE_ENV: "production" }).SWAGGER_ENABLED).toBe(false);
    expect(
      parseEnv({ ...valid, NODE_ENV: "production", SWAGGER_ENABLED: "true" }).SWAGGER_ENABLED,
    ).toBe(true);
  });

  it("reports every problem at once without echoing secret values", () => {
    const secret = "short-secret-value";
    try {
      parseEnv({ ...valid, BETTER_AUTH_SECRET: secret, DATABASE_URL: "mysql://nope" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const { message, issues } = error as EnvValidationError;
      expect(issues).toHaveLength(2);
      expect(message).toContain("BETTER_AUTH_SECRET");
      expect(message).toContain("DATABASE_URL");
      expect(message).not.toContain(secret);
    }
  });

  it("says plainly when a variable is missing", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL: is required/);
  });

  it("rejects an empty origin list", () => {
    expect(() => parseEnv({ ...valid, CORS_ALLOWED_ORIGINS: " , " })).toThrow(EnvValidationError);
  });
});
