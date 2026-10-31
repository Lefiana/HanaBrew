import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function themeTokens(theme: string): Record<string, string> {
  const block = css
    .split("}")
    .find((chunk) => chunk.includes(`[data-theme="${theme}"]`) && chunk.includes("--hb-bg"));
  if (!block) throw new Error(`theme ${theme} not found`);
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/--hb-([\w-]+):\s*([^;]+);/g)) {
    tokens[match[1]!] = match[2]!.trim().replace(/\s*\/\*.*$/, "");
  }
  return tokens;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground token, background token]; every pair here is real text-on-surface usage.
const TEXT_PAIRS: Array<[string, string]> = [
  ["text", "bg"],
  ["text", "surface"],
  ["text-muted", "bg"],
  ["text-muted", "surface"],
  ["on-accent", "accent"],
  ["on-accent", "accent-hover"],
  ["on-secondary", "secondary"],
  ["secondary-text", "surface"],
  ["danger", "surface"],
  ["on-danger", "danger"],
];

describe.each(["sakura-latte", "midnight-blossom"])("%s theme", (theme) => {
  const tokens = themeTokens(theme);

  it.each(TEXT_PAIRS)("%s on %s meets WCAG AA (4.5:1)", (fg, bg) => {
    expect(tokens[fg], `missing token ${fg}`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokens[bg], `missing token ${bg}`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the focus ring visible against the page (3:1)", () => {
    expect(contrast(tokens["ring"]!, tokens["bg"]!)).toBeGreaterThanOrEqual(3);
  });
});

describe("brand palette", () => {
  it("keeps the specified Sakura Latte foundation colours", () => {
    const t = themeTokens("sakura-latte");
    expect(t["accent"]).toBe("#ffb7c5");
    expect(t["bg"]).toBe("#fffdd0");
    expect(t["text"]).toBe("#4a2c2a");
    expect(t["secondary"]).toBe("#9caf88");
  });
});
