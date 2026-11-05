/* eslint-disable @typescript-eslint/no-explicit-any -- assertions on loosely-shaped JSON responses */
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterEach, describe, expect, it } from "vitest";
import { bootApp, Client } from "./helpers.js";
import { ScriptedProvider } from "./scripted-provider.js";
import type { ProviderBuildOptions } from "../src/modules/ai/provider-factory.js";

/** These tests change environment variables that the app reads at startup, so each boots its own app. */
const ENV_KEYS = [
  "APP_ENCRYPTION_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "OLLAMA_BASE_URL",
  "AI_ALLOW_CUSTOM_OLLAMA_URL",
  "AI_RATE_LIMIT_PER_MINUTE",
] as const;
const original = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let app: NestExpressApplication | undefined;
let n = 0;

afterEach(async () => {
  await app?.close();
  app = undefined;
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key]!;
  }
});

const user = async (a: NestExpressApplication, prefix = "cfg") =>
  Client.signUp(a, `${prefix}_${(n += 1)}_${Math.random().toString(36).slice(2, 6)}`);

function recorder() {
  const calls: Array<{ provider: string; options: ProviderBuildOptions }> = [];
  const provider = new ScriptedProvider("ollama");
  return {
    calls,
    provider,
    factory: (p: any, options: ProviderBuildOptions) => (
      calls.push({ provider: p, options }),
      provider
    ),
  };
}

describe("encryption key", () => {
  it("without APP_ENCRYPTION_KEY users can't store keys, and are told why; models can still be chosen", async () => {
    delete process.env.APP_ENCRYPTION_KEY;
    app = await bootApp(recorder().factory);
    const c = await user(app);
    expect((await c.get("/api/ai/overview")).body.keyStorageAvailable).toBe(false);
    const res = await c.put("/api/ai/providers/gemini", { apiKey: "AIzaSy-cannot-store-this-1" });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/APP_ENCRYPTION_KEY/);
    expect((await c.put("/api/ai/providers/gemini", { model: "gemini-test" })).status).toBe(200);
  });

  it("a stored key that can no longer be decrypted (master key changed) is treated as missing, not as an error or a leak", async () => {
    process.env.APP_ENCRYPTION_KEY = "first-master-key-first-master-key-0123456789";
    app = await bootApp(recorder().factory);
    const c = await user(app, "rot");
    const username = (await c.get("/api/me")).body.user.username as string;
    await c.put("/api/ai/providers/gemini", {
      apiKey: "AIzaSy-rotated-key-5555",
      model: "gemini-test",
    });
    expect((await c.get("/api/ai/overview")).body.providers[0]).toMatchObject({
      hasKey: true,
      ready: true,
    });
    await app.close();

    process.env.APP_ENCRYPTION_KEY = "second-master-key-second-master-key-9876543210";
    app = await bootApp(recorder().factory);
    const again = await Client.signIn(app, username);
    const gemini = (await again.get("/api/ai/overview")).body.providers[0];
    expect(gemini).toMatchObject({ hasKey: false, ready: false });
    await again.patch("/api/ai/settings", { preferredProvider: "GEMINI" });
    const chat = await again.post("/api/ai/chat", { message: "hello" });
    expect(chat.status).toBe(422);
    expect(JSON.stringify(chat.body)).not.toContain("AIzaSy");
  });
});

describe("server-level credentials", () => {
  it("a server key makes a provider usable, and a user's own key takes precedence", async () => {
    process.env.GEMINI_API_KEY = "server-gemini-key-0000";
    const rec = recorder();
    app = await bootApp(rec.factory);
    const c = await user(app);

    const before = (await c.get("/api/ai/overview")).body.providers[0];
    expect(before).toMatchObject({ source: "server", hasKey: true, ready: false, keyHint: null }); // needs a model
    expect(JSON.stringify(before)).not.toContain("server-gemini-key");

    await c.put("/api/ai/providers/gemini", { model: "gemini-test" });
    rec.provider.say("hi");
    await c.post("/api/ai/chat", { message: "hello" });
    expect(rec.calls.at(-1)).toMatchObject({
      provider: "GEMINI",
      options: { apiKey: "server-gemini-key-0000" },
    });

    await c.put("/api/ai/providers/gemini", { apiKey: "my-own-gemini-key-1111" });
    expect((await c.get("/api/ai/overview")).body.providers[0].source).toBe("user");
    rec.provider.say("hi again");
    await c.post("/api/ai/chat", { message: "hello again" });
    expect(rec.calls.at(-1)!.options.apiKey).toBe("my-own-gemini-key-1111");
  });

  it("uses the server's OLLAMA_BASE_URL by default", async () => {
    process.env.OLLAMA_BASE_URL = "http://ollama.internal:11434";
    const rec = recorder();
    app = await bootApp(rec.factory);
    const c = await user(app);
    await c.put("/api/ai/providers/ollama", { model: "m" });
    expect((await c.get("/api/ai/overview")).body.providers[2]).toMatchObject({
      baseUrl: "http://ollama.internal:11434",
      source: "server",
      customBaseUrlAllowed: false,
    });
    rec.provider.say("hi");
    await c.post("/api/ai/chat", { message: "hello" });
    expect(rec.calls.at(-1)!.options.baseUrl).toBe("http://ollama.internal:11434");
  });
});

describe("custom Ollama endpoints (opt-in, guarded)", () => {
  it("accepts a safe endpoint and uses it; refuses cloud-metadata and odd schemes; null restores the default", async () => {
    process.env.AI_ALLOW_CUSTOM_OLLAMA_URL = "true";
    process.env.OLLAMA_BASE_URL = "http://default-ollama:11434";
    const rec = recorder();
    app = await bootApp(rec.factory);
    const c = await user(app);

    const ok = await c.put("/api/ai/providers/ollama", {
      model: "m",
      baseUrl: "http://192.168.1.50:11434/",
    });
    expect(ok.body).toMatchObject({
      baseUrl: "http://192.168.1.50:11434",
      source: "user",
      customBaseUrlAllowed: true,
    });
    rec.provider.say("hi");
    await c.post("/api/ai/chat", { message: "hello" });
    expect(rec.calls.at(-1)!.options.baseUrl).toBe("http://192.168.1.50:11434");

    for (const bad of [
      "http://169.254.169.254/latest",
      "http://metadata.google.internal",
      "file:///etc/passwd",
      "http://user:pw@localhost:1",
    ]) {
      const res = await c.put("/api/ai/providers/ollama", { baseUrl: bad });
      expect(res.status, bad).toBe(400);
      expect(res.body.issues[0].path).toBe("baseUrl");
    }
    expect((await c.get("/api/ai/overview")).body.providers[2].baseUrl).toBe(
      "http://192.168.1.50:11434",
    ); // unchanged by the refusals

    const cleared = await c.put("/api/ai/providers/ollama", { baseUrl: null });
    expect(cleared.body).toMatchObject({
      baseUrl: "http://default-ollama:11434",
      source: "server",
    });
  });
});

describe("rate limiting", () => {
  it("limits calls that reach the model", async () => {
    process.env.AI_RATE_LIMIT_PER_MINUTE = "3";
    const rec = recorder();
    app = await bootApp(rec.factory);
    const c = await user(app);
    await c.put("/api/ai/providers/ollama", { model: "m" });
    for (let i = 0; i < 3; i++) rec.provider.say("ok");
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++)
      statuses.push((await c.post("/api/ai/chat", { message: `hello ${i}` })).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(rec.provider.requests).toHaveLength(3); // throttled requests never reached the model
  });
});
