import { describe, expect, it } from "vitest";
import {
  chatRequestSchema,
  isCloudProvider,
  updateAiSettingsSchema,
  updateProviderSchema,
} from "./index.js";

describe("AI contracts", () => {
  it("validates chat requests", () => {
    expect(chatRequestSchema.parse({ message: "  hi  " }).message).toBe("hi");
    expect(chatRequestSchema.safeParse({ message: "   " }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: "x".repeat(4001) }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: "hi", conversationId: "nope" }).success).toBe(
      false,
    );
    expect(chatRequestSchema.safeParse({ message: "hi", timeZone: "Mars/Base" }).success).toBe(
      false,
    );
    expect(chatRequestSchema.safeParse({ message: "hi", userId: "x" }).success).toBe(false); // no client-supplied identity
  });
  it("provider updates need something to change and a sane key", () => {
    expect(updateProviderSchema.safeParse({}).success).toBe(false);
    expect(updateProviderSchema.safeParse({ apiKey: "short" }).success).toBe(false);
    expect(updateProviderSchema.safeParse({ apiKey: "long-enough-key", model: "m" }).success).toBe(
      true,
    );
    expect(updateProviderSchema.safeParse({ baseUrl: "not a url" }).success).toBe(false);
  });
  it("settings accept known policies only", () => {
    expect(updateAiSettingsSchema.safeParse({ confirmationPolicy: "NEVER" }).success).toBe(false);
    expect(updateAiSettingsSchema.safeParse({ allowCloudFallback: true }).success).toBe(true);
  });
  it("knows which providers are cloud", () => {
    expect(["GEMINI", "GROQ", "OLLAMA"].map((p) => isCloudProvider(p as never))).toEqual([
      true,
      true,
      false,
    ]);
  });
});
