import { existsSync } from "node:fs";
import { resolve } from "node:path";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// e2e tests need TEST_DATABASE_URL. Read it from the repo-root .env so it works the same in
// PowerShell, cmd and bash (no shell-specific `export`/`set` needed). Real env vars win.
const rootEnv = resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Vitest hides errors thrown from a globalSetup behind "No test files found", so check up front.
if (process.argv.includes("e2e") && !process.env.TEST_DATABASE_URL) {
  console.error(
    "\nTEST_DATABASE_URL is not set.\n" +
      "Add it to the repo-root .env (see .env.example), e.g.\n" +
      "  TEST_DATABASE_URL=postgresql://hanabrew:<password>@localhost:5432/hanabrew_test\n" +
      "and create the database once:  docker compose exec postgres createdb -U hanabrew hanabrew_test\n",
  );
  process.exit(1);
}

// SWC emits the decorator metadata NestJS dependency injection relies on (esbuild does not).
const nestSwc = swc.vite({
  module: { type: "es6" },
  jsc: {
    target: "es2023",
    parser: { syntax: "typescript", decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
  },
});

export default defineConfig({
  plugins: [nestSwc],
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.spec.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "e2e",
          include: ["test/**/*.e2e-spec.ts"],
          environment: "node",
          globalSetup: ["./test/global-setup.ts"],
          setupFiles: ["./test/env.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
