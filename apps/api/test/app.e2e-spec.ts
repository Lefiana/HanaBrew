import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { meResponseSchema, placeholderEmailFor } from "@hanabrew/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/bootstrap.js";
import { ENV } from "../src/config/config.module.js";
import type { Env } from "../src/config/env.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { WorkspacesService } from "../src/modules/workspaces/workspaces.service.js";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "correct-horse-battery";

let app: NestExpressApplication;
let prisma: PrismaService;
let workspaces: WorkspacesService;

/** supertest types set-cookie as a string, but Node delivers an array; normalise both. */
function cookiesOf(res: { headers: Record<string, unknown> }): string {
  return [res.headers["set-cookie"]].flat().filter(Boolean).join(";");
}

function server() {
  return app.getHttpServer();
}

async function signUp(username: string, extra: Record<string, unknown> = {}) {
  return request(server())
    .post("/api/auth/sign-up/email")
    .set("Origin", ORIGIN)
    .send({
      email: `${username}@whatever.example.com`,
      password: PASSWORD,
      name: username,
      username,
      ...extra,
    });
}

/** A supertest agent that keeps the session cookie, like a browser would. */
async function signedInAgent(username: string) {
  const agent = request.agent(server());
  const res = await agent
    .post("/api/auth/sign-up/email")
    .set("Origin", ORIGIN)
    .send({ email: `${username}@x.example.com`, password: PASSWORD, name: username, username });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureApp(app, moduleRef.get<Env>(ENV));
  await app.init();
  prisma = app.get(PrismaService);
  workspaces = app.get(WorkspacesService);
});

afterAll(async () => {
  await app?.close();
});

describe("health", () => {
  it("liveness is public", async () => {
    const res = await request(server()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("readiness reports the database as up", async () => {
    const res = await request(server()).get("/api/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", checks: { database: "up" } });
  });
});

describe("authentication", () => {
  it("private routes reject anonymous requests with the shared error shape", async () => {
    const res = await request(server()).get("/api/me");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ statusCode: 401 });
    expect(res.body.requestId).toBeTruthy();
  });

  it("signs up with a username, ignores the client email, and provisions one workspace", async () => {
    const res = await signUp("alice");
    expect(res.status).toBe(200);
    expect(cookiesOf(res)).toContain("hanabrew.session_token");

    const user = await prisma.client.user.findUniqueOrThrow({ where: { username: "alice" } });
    expect(user.email).toBe(placeholderEmailFor("alice"));
    expect(user.email).not.toContain("whatever.example.com");

    const memberships = await prisma.client.workspaceMembership.findMany({
      where: { userId: user.id },
      include: { workspace: true },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ role: "OWNER" });
    expect(memberships[0]?.workspace.kind).toBe("PERSONAL");
  });

  it("GET /api/me returns the signed-in user's own identity and workspace", async () => {
    const agent = await signedInAgent("carol");
    const res = await agent.get("/api/me");
    expect(res.status).toBe(200);
    const me = meResponseSchema.parse(res.body);
    expect(me.user.username).toBe("carol");
    expect(me.workspace).toMatchObject({ kind: "PERSONAL", role: "OWNER" });
  });

  it("signs in by username (case-insensitive) and rejects a wrong password generically", async () => {
    const ok = await request(server())
      .post("/api/auth/sign-in/username")
      .set("Origin", ORIGIN)
      .send({ username: "ALICE", password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(cookiesOf(ok)).toContain("hanabrew.session_token");

    const wrong = await request(server())
      .post("/api/auth/sign-in/username")
      .set("Origin", ORIGIN)
      .send({ username: "alice", password: "not-the-password" });
    const missing = await request(server())
      .post("/api/auth/sign-in/username")
      .set("Origin", ORIGIN)
      .send({ username: "nobody_here", password: "not-the-password" });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.message).toBe(missing.body.message);
  });

  it("rejects duplicate usernames regardless of case", async () => {
    const res = await signUp("Alice");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await prisma.client.user.count({ where: { username: "alice" } })).toBe(1);
  });

  it.each([
    ["a username with spaces", { username: "has space" }],
    ["a username that is too short", { username: "ab" }],
    ["a password under 10 characters", { username: "dave", password: "short" }],
    ["no username at all", { username: undefined }],
  ])("rejects sign-up with %s", async (_label, extra) => {
    const res = await signUp(`user_${Math.random().toString(36).slice(2, 8)}`, extra);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("signing out invalidates the session", async () => {
    const agent = await signedInAgent("erin");
    expect((await agent.get("/api/me")).status).toBe(200);
    const out = await agent.post("/api/auth/sign-out").set("Origin", ORIGIN).send({});
    expect(out.status).toBe(200);
    expect((await agent.get("/api/me")).status).toBe(401);
  });
});

describe("data isolation", () => {
  it("each user only ever sees their own workspace", async () => {
    const [a, b] = await Promise.all([signedInAgent("frank"), signedInAgent("grace")]);
    const meA = meResponseSchema.parse((await a.get("/api/me")).body);
    const meB = meResponseSchema.parse((await b.get("/api/me")).body);
    expect(meA.user.id).not.toBe(meB.user.id);
    expect(meA.workspace.id).not.toBe(meB.workspace.id);
    expect(meA.user.username).toBe("frank");
    expect(meB.user.username).toBe("grace");

    const count = await prisma.client.workspace.count({
      where: { ownerId: { in: [meA.user.id, meB.user.id] } },
    });
    expect(count).toBe(2);
  });

  it("concurrent provisioning never creates a second personal workspace", async () => {
    const user = await prisma.client.user.create({
      data: { name: "Race", email: "race@users.hanabrew.invalid", username: "race_user" },
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => workspaces.ensurePersonalWorkspace(user.id, "Race")),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await prisma.client.workspace.count({ where: { ownerId: user.id } })).toBe(1);
  });

  it("the database itself refuses a second personal workspace", async () => {
    const user = await prisma.client.user.create({
      data: { name: "Dup", email: "dup@users.hanabrew.invalid", username: "dup_user" },
    });
    await prisma.client.workspace.create({ data: { name: "one", ownerId: user.id } });
    await expect(
      prisma.client.workspace.create({ data: { name: "two", ownerId: user.id } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("HTTP hardening", () => {
  it("allows credentialed CORS only for configured origins", async () => {
    const allowed = await request(server())
      .options("/api/me")
      .set("Origin", ORIGIN)
      .set("Access-Control-Request-Method", "GET");
    expect(allowed.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const denied = await request(server())
      .options("/api/me")
      .set("Origin", "http://evil.example")
      .set("Access-Control-Request-Method", "GET");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers auth-route preflights with a single correct CORS origin header", async () => {
    const res = await request(server())
      .options("/api/auth/sign-in/username")
      .set("Origin", ORIGIN)
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
  });

  it("sends secure headers and hides the framework", async () => {
    const res = await request(server()).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("serves OpenAPI docs when enabled", async () => {
    expect((await request(server()).get("/docs-json")).status).toBe(200);
  });
});
