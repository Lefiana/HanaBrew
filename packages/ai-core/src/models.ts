import type { ProviderId } from "./types.js";

/** Model ids that exist on the provider but can't be the chat + tools brain (images, speech, embeddings...). */
const NOT_FOR_CHAT: Record<ProviderId, RegExp> = {
  gemini:
    /(^|[-_/])(image|imagen|tts|live|audio|native-audio|embedding|embed|veo|aqa|robotics|computer-use|transcribe|learnlm|gemma)([-_/]|$)/i,
  groq: /whisper|tts|playai|guard|compound|embed/i,
  ollama: /embed|rerank/i,
};

export function isChatModel(provider: ProviderId, id: string): boolean {
  return !NOT_FOR_CHAT[provider].test(id);
}

const versionOf = (id: string): number[] =>
  (/(\d+(?:\.\d+)*)/.exec(id)?.[1] ?? "0").split(".").map(Number);

/** Newest version first (gemini-3.8-flash before gemini-3.5-flash), then alphabetical. */
export function sortModelsNewestFirst(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const va = versionOf(a);
    const vb = versionOf(b);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const diff = (vb[i] ?? 0) - (va[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return a.localeCompare(b);
  });
}
