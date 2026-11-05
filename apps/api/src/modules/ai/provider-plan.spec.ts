import type { AiProviderId, AiSettings, ProviderStatus } from "@hanabrew/contracts";
import { describe, expect, it } from "vitest";
import { planProviders } from "./provider-plan.js";

const status = (provider: AiProviderId, ready: boolean): ProviderStatus => ({
  provider,
  ready,
  source: ready ? "user" : "none",
  hasKey: ready,
  keyHint: null,
  model: ready ? "m" : null,
  baseUrl: null,
  cloud: provider !== "OLLAMA",
  needsKey: provider !== "OLLAMA",
  customBaseUrlAllowed: false,
});
const settings = (over: Partial<AiSettings> = {}): AiSettings => ({
  preferredProvider: null,
  fallbackProvider: null,
  allowCloudFallback: false,
  confirmationPolicy: "DESTRUCTIVE_ONLY",
  ...over,
});
const all = (ready: Partial<Record<AiProviderId, boolean>>) =>
  (["GEMINI", "GROQ", "OLLAMA"] as const).map((p) => status(p, ready[p] ?? false));

describe("planProviders", () => {
  it("reports when nothing is set up", () => {
    expect(planProviders(all({}), settings())).toMatchObject({
      primary: null,
      problem: expect.stringMatching(/No AI provider/),
    });
  });

  it("uses a fixed order when there's no preference", () => {
    expect(planProviders(all({ GROQ: true, OLLAMA: true }), settings()).primary).toBe("GROQ");
    expect(planProviders(all({ OLLAMA: true }), settings()).primary).toBe("OLLAMA");
  });

  it("honours the preferred provider", () => {
    expect(
      planProviders(all({ GEMINI: true, OLLAMA: true }), settings({ preferredProvider: "OLLAMA" }))
        .primary,
    ).toBe("OLLAMA");
  });

  it("NEVER silently switches away from a preferred provider that isn't ready (privacy)", () => {
    const plan = planProviders(
      all({ GEMINI: true, GROQ: true }),
      settings({
        preferredProvider: "OLLAMA",
        fallbackProvider: "GEMINI",
        allowCloudFallback: true,
      }),
    );
    expect(plan.primary).toBeNull();
    expect(plan.fallback).toBeNull();
    expect(plan.problem).toMatch(/Ollama.*isn't ready/);
  });

  it("a local fallback is allowed without extra consent", () => {
    expect(
      planProviders(
        all({ GEMINI: true, OLLAMA: true }),
        settings({ preferredProvider: "GEMINI", fallbackProvider: "OLLAMA" }),
      ).fallback,
    ).toBe("OLLAMA");
  });

  it("a cloud fallback needs explicit consent", () => {
    const base = { preferredProvider: "OLLAMA", fallbackProvider: "GEMINI" } as const;
    expect(planProviders(all({ OLLAMA: true, GEMINI: true }), settings(base)).fallback).toBeNull();
    expect(
      planProviders(
        all({ OLLAMA: true, GEMINI: true }),
        settings({ ...base, allowCloudFallback: true }),
      ).fallback,
    ).toBe("GEMINI");
  });

  it("ignores a fallback that isn't ready or equals the primary", () => {
    expect(
      planProviders(
        all({ OLLAMA: true }),
        settings({
          preferredProvider: "OLLAMA",
          fallbackProvider: "GEMINI",
          allowCloudFallback: true,
        }),
      ).fallback,
    ).toBeNull();
    expect(
      planProviders(
        all({ OLLAMA: true }),
        settings({ preferredProvider: "OLLAMA", fallbackProvider: "OLLAMA" }),
      ).fallback,
    ).toBeNull();
  });
});
