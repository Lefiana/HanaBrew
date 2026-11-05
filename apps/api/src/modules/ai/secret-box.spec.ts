import { describe, expect, it } from "vitest";
import { SecretBox } from "./secret-box.js";

const MASTER = "m".repeat(40);
const KEY = "AIzaSyD-super-secret-api-key-1234";

describe("SecretBox", () => {
  const box = new SecretBox(MASTER);

  it("round-trips a secret, and the stored form never contains the plaintext", () => {
    const stored = box.encrypt(KEY, "user-1:GEMINI");
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain(KEY);
    expect(stored).not.toContain(Buffer.from(KEY).toString("base64"));
    expect(box.decrypt(stored, "user-1:GEMINI")).toBe(KEY);
  });

  it("uses a fresh IV every time", () => {
    expect(box.encrypt(KEY, "c")).not.toBe(box.encrypt(KEY, "c"));
  });

  it("refuses ciphertext moved to another row (AAD binding)", () => {
    const stored = box.encrypt(KEY, "user-1:GEMINI");
    expect(box.decrypt(stored, "user-2:GEMINI")).toBeNull();
    expect(box.decrypt(stored, "user-1:GROQ")).toBeNull();
  });

  it("detects tampering in any segment", () => {
    const [v, iv, tag, ct] = box.encrypt(KEY, "c").split(".") as [string, string, string, string];
    const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);
    for (const tampered of [
      [v, flip(iv), tag, ct],
      [v, iv, flip(tag), ct],
      [v, iv, tag, flip(ct)],
      ["v9", iv, tag, ct],
    ]) {
      expect(box.decrypt(tampered.join("."), "c")).toBeNull();
    }
    expect(box.decrypt("garbage", "c")).toBeNull();
    expect(box.decrypt("", "c")).toBeNull();
  });

  it("cannot be decrypted with a different master key", () => {
    const stored = box.encrypt(KEY, "c");
    expect(new SecretBox("n".repeat(40)).decrypt(stored, "c")).toBeNull();
  });

  it("is unavailable without a master key, and refuses to encrypt", () => {
    const none = new SecretBox(undefined);
    expect(none.available).toBe(false);
    expect(() => none.encrypt(KEY, "c")).toThrow();
    expect(none.decrypt(box.encrypt(KEY, "c"), "c")).toBeNull();
  });
});
