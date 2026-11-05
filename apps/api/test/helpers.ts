import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import type { AIProvider } from "@hanabrew/ai-core";
import type { ProviderBuildOptions } from "../src/modules/ai/provider-factory.js";
import request from "supertest";
import { expect } from "vitest";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/bootstrap.js";
import { ENV } from "../src/config/config.module.js";
import { AI_PROVIDER_FACTORY } from "../src/modules/ai/provider-factory.js";
import type { Env } from "../src/config/env.js";

export const ORIGIN = "http://localhost:3000";
export const PASSWORD = "correct-horse-battery";

type ProviderId = "GEMINI" | "GROQ" | "OLLAMA";

/** Either a map of fake providers, or a factory function that also sees the credentials the app would have used. */
export type ProviderOverride =
  | Partial<Record<ProviderId, AIProvider>>
  | ((provider: ProviderId, options: ProviderBuildOptions) => AIProvider);

export async function bootApp(providers?: ProviderOverride): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  // Tests never call a real AI provider: the factory hands out scripted fakes instead.
  if (providers) {
    const factory =
      typeof providers === "function"
        ? providers
        : (provider: ProviderId) => {
            const found = providers[provider];
            if (!found) throw new Error(`No scripted provider for ${provider}`);
            return found;
          };
    builder = builder.overrideProvider(AI_PROVIDER_FACTORY).useValue(factory);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureApp(app, moduleRef.get<Env>(ENV));
  await app.init();
  return app;
}

/** A browser-like client: keeps the session cookie and sends the web app's Origin on writes. */
export class Client {
  constructor(private readonly agent: ReturnType<typeof request.agent>) {}

  static async signUp(app: NestExpressApplication, username: string): Promise<Client> {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post("/api/auth/sign-up/email")
      .set("Origin", ORIGIN)
      .send({ email: `${username}@x.example.com`, password: PASSWORD, name: username, username });
    expect(res.status).toBe(200);
    return new Client(agent);
  }

  /** Signs in an existing user (by username) and returns a client holding the session cookie. */
  static async signIn(app: NestExpressApplication, username: string): Promise<Client> {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post("/api/auth/sign-in/username")
      .set("Origin", ORIGIN)
      .send({ username, password: PASSWORD });
    expect(res.status).toBe(200);
    return new Client(agent);
  }

  get = (path: string) => this.agent.get(path);
  post = (path: string, body?: unknown) =>
    this.agent
      .post(path)
      .set("Origin", ORIGIN)
      .send(body as object);
  put = (path: string, body?: unknown) =>
    this.agent
      .put(path)
      .set("Origin", ORIGIN)
      .send(body as object);
  patch = (path: string, body?: unknown) =>
    this.agent
      .patch(path)
      .set("Origin", ORIGIN)
      .send(body as object);
  delete = (path: string) => this.agent.delete(path).set("Origin", ORIGIN);
}

/** YYYY-MM-DD, `days` from today in UTC. */
export function dateFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
