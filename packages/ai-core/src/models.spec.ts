import { describe, expect, it } from "vitest";
import { isChatModel, sortModelsNewestFirst } from "./models.js";

describe("isChatModel", () => {
  it.each([
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.1-pro",
    "gemini-3-flash-preview",
    "gemini-2.5-flash-lite",
  ])("keeps Gemini chat model %s", (id) => {
    expect(isChatModel("gemini", id)).toBe(true);
  });
  it.each([
    "gemini-3-pro-image-preview",
    "gemini-2.5-flash-preview-tts",
    "gemini-live-2.5-flash",
    "gemini-embedding-001",
    "imagen-4.0-generate",
    "veo-3.0",
    "gemma-3-27b-it",
    "gemini-2.5-flash-native-audio-preview",
    "gemini-robotics-er-1.5-preview",
    "gemini-2.5-computer-use-preview",
  ])("hides non-chat Gemini model %s", (id) => {
    expect(isChatModel("gemini", id)).toBe(false);
  });
  it("hides speech, guard and embedding models on Groq and Ollama", () => {
    expect(isChatModel("groq", "whisper-large-v3")).toBe(false);
    expect(isChatModel("groq", "llama-guard-4-12b")).toBe(false);
    expect(isChatModel("groq", "llama-3.3-70b-versatile")).toBe(true);
    expect(isChatModel("ollama", "nomic-embed-text:latest")).toBe(false);
    expect(isChatModel("ollama", "qwen3:8b")).toBe(true);
  });
});

describe("sortModelsNewestFirst", () => {
  it("orders by version, newest first, numerically (3.10 > 3.9)", () => {
    expect(
      sortModelsNewestFirst([
        "gemini-3.5-flash",
        "gemini-3.10-flash",
        "gemini-3.8-flash",
        "gemini-2.5-pro",
        "gemini-3.9-pro",
      ]),
    ).toEqual([
      "gemini-3.10-flash",
      "gemini-3.9-pro",
      "gemini-3.8-flash",
      "gemini-3.5-flash",
      "gemini-2.5-pro",
    ]);
  });
  it("falls back to alphabetical when versions tie, and doesn't mutate its input", () => {
    const input = ["b-model", "a-model"];
    expect(sortModelsNewestFirst(input)).toEqual(["a-model", "b-model"]);
    expect(input).toEqual(["b-model", "a-model"]);
  });
});
