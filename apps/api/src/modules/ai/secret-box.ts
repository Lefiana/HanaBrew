import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const VERSION = "v1";
const SALT = Buffer.from("hanabrew/secret-box/v1");

/**
 * Encrypts small secrets (provider API keys) at rest with AES-256-GCM. The key is derived from
 * APP_ENCRYPTION_KEY; each value gets a random IV; and the ciphertext is bound (as AAD) to the row it belongs to,
 * so a stolen ciphertext can't be pasted into another user's row. Without a master key the box is unavailable.
 */
export class SecretBox {
  private readonly key: Buffer | null;

  constructor(masterKey: string | undefined) {
    this.key = masterKey
      ? Buffer.from(
          hkdfSync(
            "sha256",
            Buffer.from(masterKey),
            SALT,
            Buffer.from("ai-provider-credentials"),
            32,
          ),
        )
      : null;
  }

  get available(): boolean {
    return this.key !== null;
  }

  encrypt(plaintext: string, context: string): string {
    if (!this.key) throw new Error("SecretBox is not configured");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [
      VERSION,
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }

  /** Returns null (never throws) when the value is malformed, tampered with, bound to another row, or the master key changed. */
  decrypt(payload: string, context: string): string | null {
    if (!this.key) return null;
    const [version, iv, tag, ciphertext] = payload.split(".");
    if (version !== VERSION || !iv || !tag || !ciphertext) return null;
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      return null;
    }
  }
}
