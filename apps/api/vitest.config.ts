import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

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
