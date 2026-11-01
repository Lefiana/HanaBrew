import { defineConfig } from "vitest/config";

const alias = { "@": new URL("./src", import.meta.url).pathname };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "logic", environment: "node", include: ["src/**/*.spec.ts"] },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.dom.spec.tsx"],
          setupFiles: ["./src/test/dom-setup.ts"],
          testTimeout: 15_000,
        },
      },
    ],
  },
});
