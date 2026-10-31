import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { requestContextMiddleware } from "./common/request-context.middleware.js";
import { APP_VERSION } from "./common/version.js";
import type { Env } from "./config/env.js";

/** Applies all HTTP-level configuration. Shared by main.ts and the e2e tests. */
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.disable("x-powered-by");
  app.setGlobalPrefix("api");
  app.use(requestContextMiddleware);

  // Swagger UI needs inline scripts, so only /docs gets a relaxed CSP.
  const strict = helmet();
  const relaxed = helmet({ contentSecurityPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith("/docs") ? relaxed(req, res, next) : strict(req, res, next),
  );

  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 600,
  });
  app.enableShutdownHooks();

  if (env.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle("HanaBrew API")
      .setDescription(
        "REST API for HanaBrew. Authentication endpoints (/api/auth/*) are served by Better Auth.",
      )
      .setVersion(APP_VERSION)
      .addCookieAuth("hanabrew.session_token")
      .build();
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
  }
}
