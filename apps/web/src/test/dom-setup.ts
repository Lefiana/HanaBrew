import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Generous: CI and parallel Turborepo runs can starve the test process of CPU.
configure({ asyncUtilTimeout: 8000 });

// jsdom doesn't implement these browser APIs.
Element.prototype.scrollTo = () => undefined;
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
})) as unknown as typeof window.matchMedia;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
