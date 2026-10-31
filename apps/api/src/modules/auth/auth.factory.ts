import { Logger } from "@nestjs/common";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { username } from "better-auth/plugins";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
  placeholderEmailFor,
} from "@hanabrew/contracts";
import type { Env } from "../../config/env.js";
import type { PrismaService } from "../../infrastructure/database/prisma.service.js";
import type { WorkspacesService } from "../workspaces/workspaces.service.js";

const logger = new Logger("Auth");

export interface AuthDependencies {
  prisma: PrismaService;
  env: Env;
  workspaces: WorkspacesService;
}

export function createAuth({ prisma, env, workspaces }: AuthDependencies) {
  // Secure cookies follow the public URL scheme, so a plain-http localhost Docker stack still works
  // while any https deployment automatically gets Secure + __Secure- prefixed cookies.
  const secureCookies = env.API_PUBLIC_URL.startsWith("https://");

  return betterAuth({
    appName: "HanaBrew",
    baseURL: env.API_PUBLIC_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.CORS_ALLOWED_ORIGINS,
    database: prismaAdapter(prisma.client, { provider: "postgresql" }),

    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
    },

    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        // The plugin lowercases usernames after validation, so validate the lowercase form.
        usernameValidator: (value) => USERNAME_PATTERN.test(value.toLowerCase()),
      }),
    ],

    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },

    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "hanabrew",
      useSecureCookies: secureCookies,
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
    },

    // In-memory counters: correct for a single API instance. Move to secondary storage
    // (Redis) before running several replicas.
    rateLimit: {
      enabled: env.NODE_ENV !== "test",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/username": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },

    databaseHooks: {
      user: {
        create: {
          // M0 accounts are username-based. The server owns the email column: whatever a
          // client sends is replaced by the reserved placeholder derived from the username.
          before: async (user) => {
            const name = (user as { username?: string | null }).username;
            if (!name) {
              throw new APIError("BAD_REQUEST", { message: "A username is required." });
            }
            return { data: { ...user, email: placeholderEmailFor(name), emailVerified: false } };
          },
          after: async (user) => {
            try {
              await workspaces.ensurePersonalWorkspace(user.id, user.name);
            } catch (error) {
              // Not fatal: GET /api/me provisions the workspace on first use.
              logger.warn(
                `Personal workspace provisioning deferred for a new user: ${String(error)}`,
              );
            }
          },
        },
      },
    },
  });
}

export type AppAuth = ReturnType<typeof createAuth>;
