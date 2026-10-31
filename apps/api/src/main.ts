import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { configureApp } from "./bootstrap.js";
import { ENV } from "./config/config.module.js";
import { EnvValidationError, parseEnv, type Env } from "./config/env.js";
import { loadDotenvForDevelopment } from "./config/load-dotenv.js";

async function bootstrap(): Promise<void> {
  loadDotenvForDevelopment();
  parseEnv(process.env); // fail fast with a readable message before Nest starts
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Required by Better Auth; its Nest module re-adds body parsers for non-auth routes.
    bodyParser: false,
  });
  const env = app.get<Env>(ENV);
  configureApp(app, env);
  if (env.NODE_ENV === "production" && !env.API_PUBLIC_URL.startsWith("https://")) {
    new Logger("Bootstrap").warn(
      "API_PUBLIC_URL is not https: session cookies will not be marked Secure. Terminate TLS in front of the API for real deployments.",
    );
  }
  await app.listen(env.API_PORT);
  new Logger("Bootstrap").log(`API listening on :${env.API_PORT} (${env.NODE_ENV})`);
}

bootstrap().catch((error: unknown) => {
  // Configuration errors are expected operator mistakes: print them plainly, without a stack.
  if (error instanceof EnvValidationError) console.error(error.message);
  else console.error(error);
  process.exit(1);
});
